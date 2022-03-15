import {HistoricRate, Rates, Wallet} from '../../wallet.models';
import {FormatAmountStr} from '../amount/amount';
import {BwcProvider} from '../../../../lib/bwc';
import uniqBy from 'lodash.uniqby';
import {
  DEFAULT_RBF_SEQ_NUMBER,
  SAFE_CONFIRMATIONS,
} from '../../../../constants/wallet';
import {
  GetChain,
  IsCustomERCToken,
  IsERCToken,
  IsUtxoCoin,
} from '../../utils/currency';
import {ToAddress, ToLtcAddress} from '../address/address';
import {
  IsDateInCurrentMonth,
  WithinPastDay,
  WithinSameMonth,
} from '../../utils/time';
import moment from 'moment';
import {TransactionIcons} from '../../../../constants/TransactionIcons';
import {Effect} from '../../../index';
import {getHistoricFiatRate, startGetRates} from '../rates/rates';
import {toFiat} from '../../utils/wallet';
import {formatFiatAmount} from '../../../../utils/helper-methods';
import {getFeeRatePerKb} from '../fee/fee';
import {updateWalletTxHistory} from '../../wallet.actions';

const BWC = BwcProvider.getInstance();
const Errors = BWC.getErrors();

export const TX_HISTORY_LIMIT = 25;

const GetCoinsForTx = (wallet: Wallet, txId: string): Promise<any> => {
  const {
    credentials: {coin, network},
  } = wallet;
  return new Promise((resolve, reject) => {
    wallet.getCoinsForTx(
      {
        coin,
        network,
        txId,
      },
      (err: Error, response: any) => {
        if (err) {
          return reject(err);
        }
        return resolve(response);
      },
    );
  });
};

const ProcessTx = (currencyAbbreviation: string, tx: any) => {
  if (!tx || tx.action === 'invalid') {
    return tx;
  }

  // New transaction output format. Fill tx.amount and tx.toAmount for
  // backward compatibility.
  if (tx.outputs?.length) {
    const outputsNr = tx.outputs.length;

    if (tx.action !== 'received') {
      if (outputsNr > 1) {
        tx.recipientCount = outputsNr;
        tx.hasMultiplesOutputs = true;
      }
      tx.amount = tx.outputs.reduce((total: number, o: any) => {
        o.amountStr = FormatAmountStr(currencyAbbreviation, o.amount);
        return total + o.amount;
      }, 0);
    }
    tx.toAddress = tx.outputs[0].toAddress;

    // translate legacy addresses
    if (tx.addressTo && currencyAbbreviation === 'ltc') {
      for (let o of tx.outputs) {
        o.address = o.addressToShow = ToLtcAddress(tx.addressTo);
      }
    }

    if (tx.toAddress) {
      tx.toAddress = ToAddress(tx.toAddress, currencyAbbreviation);
    }
  }

  // Old tx format. Fill .output, for forward compatibility
  if (!tx.outputs) {
    tx.outputs = [
      {
        address: tx.toAddress,
        amount: tx.amount,
      },
    ];
  }

  tx.amountStr = FormatAmountStr(currencyAbbreviation, tx.amount);

  const chain = GetChain(currencyAbbreviation).toLowerCase();

  tx.feeStr = tx.fee
    ? FormatAmountStr(chain, tx.fee)
    : tx.fees
    ? FormatAmountStr(chain, tx.fees)
    : 'N/A';

  if (tx.amountStr) {
    tx.amountValueStr = tx.amountStr.split(' ')[0];
    tx.amountUnitStr = tx.amountStr.split(' ')[1];
  }

  if (tx.size && (tx.fee || tx.fees) && tx.amountUnitStr) {
    tx.feeRate = `${((tx.fee || tx.fees) / tx.size).toFixed(0)} sat/byte`;
  }

  if (tx.addressTo) {
    tx.addressTo = ToAddress(tx.addressTo, currencyAbbreviation);
  }

  return tx;
};

const ProcessNewTxs = async (wallet: Wallet, txs: any[]): Promise<any> => {
  const now = Math.floor(Date.now() / 1000);
  const txHistoryUnique: any = {};
  const ret = [];
  const {currencyAbbreviation} = wallet;

  for (let tx of txs) {
    tx = ProcessTx(currencyAbbreviation, tx);

    // no future transactions...
    if (tx.time > now) {
      tx.time = now;
    }

    if (tx.confirmations === 0 && currencyAbbreviation === 'btc') {
      const {inputs} = await GetCoinsForTx(wallet, tx.txid);
      tx.isRBF = inputs.some(
        (input: any) =>
          input.sequenceNumber &&
          input.sequenceNumber < DEFAULT_RBF_SEQ_NUMBER - 1,
      );
      tx.hasUnconfirmedInputs = inputs.some(
        (input: any) => input.mintHeight < 0,
      );
    }

    if (tx.confirmations >= SAFE_CONFIRMATIONS) {
      tx.safeConfirmed = SAFE_CONFIRMATIONS + '+';
    } else {
      tx.safeConfirmed = false;
    }

    if (tx.note) {
      delete tx.note.encryptedEditedByName;
      delete tx.note.encryptedBody;
    }

    if (!txHistoryUnique[tx.txid]) {
      ret.push(tx);
      txHistoryUnique[tx.txid] = true;
    } else {
      console.log('Ignoring duplicate TX in history: ' + tx.txid);
    }
  }
  return Promise.resolve(ret);
};

const GetNewTransactions = (
  newTxs: any[],
  skip: number,
  wallet: Wallet,
  requestLimit: number,
  lastTransactionId: string | null,
  tries: number = 0,
): Promise<any> => {
  return new Promise((resolve, reject) => {
    GetTransactionHistoryFromServer(
      wallet,
      skip,
      lastTransactionId,
      requestLimit,
    )
      .then(async result => {
        const {transactions, loadMore = false} = result;

        let _transactions = transactions.filter(txs => txs);
        const _newTxs = await ProcessNewTxs(wallet, _transactions);
        newTxs = newTxs.concat(_newTxs);

        console.log(
          `Merging TXs for: ${wallet.id}. Got: ${newTxs.length} Skip: ${skip} lastTransactionId: ${lastTransactionId} Load more: ${loadMore}`,
        );

        return resolve({
          transactions: newTxs,
          loadMore,
        });
      })
      .catch(err => {
        if (
          err instanceof Errors.CONNECTION_ERROR ||
          (err.message && err.message.match(/5../))
        ) {
          if (tries > 1) {
            return reject(err);
          }

          return setTimeout(() => {
            return resolve(
              GetNewTransactions(
                newTxs,
                skip,
                wallet,
                requestLimit,
                lastTransactionId,
                ++tries,
              ),
            );
          }, 2000 + 3000 * tries);
        } else {
          return reject(err);
        }
      });
  });
};

export const GetTransactionHistoryFromServer = (
  wallet: Wallet,
  skip: number,
  lastTransactionId: string | null,
  limit: number,
): Promise<{transactions: any[]; loadMore: boolean}> => {
  return new Promise((resolve, reject) => {
    let transactions: any[] = [];
    const result = {
      transactions,
      loadMore: transactions.length >= limit,
    };

    const {token, multisigEthInfo} = wallet.credentials;
    wallet.getTxHistory(
      {
        skip,
        limit,
        tokenAddress: token ? token.address : '',
        multisigContractAddress: multisigEthInfo
          ? multisigEthInfo.multisigContractAddress
          : '',
      },
      (err: Error, _transactions: any) => {
        if (err) {
          return reject(err);
        }

        if (!_transactions?.length) {
          return resolve(result);
        }

        _transactions.some((tx: any) => {
          if (tx.txid !== lastTransactionId) {
            transactions.push(tx);
          }
          return tx.txid === lastTransactionId;
        });

        result.transactions = transactions;
        result.loadMore = transactions.length >= limit;

        return resolve(result);
      },
    );
  });
};

const IsFirstInGroup = (index: number, history: any[]) => {
  if (index === 0) {
    return true;
  }
  const curTx = history[index];
  const prevTx = history[index - 1];
  return !WithinSameMonth(curTx.time * 1000, prevTx.time * 1000);
};

export const GroupTransactionHistory = (history: any[]) => {
  return history
    .reduce((groups, tx, txInd) => {
      IsFirstInGroup(txInd, history)
        ? groups.push([tx])
        : groups[groups.length - 1].push(tx);
      return groups;
    }, [])
    .map((group: any[]) => {
      const time = group[0].time * 1000;
      const title = IsDateInCurrentMonth(time)
        ? 'Recent'
        : moment(time).format('MMMM');
      return {title, data: group};
    });
};

export const GetTransactionHistory =
  ({
    wallet,
    transactionsHistory = [],
    limit = TX_HISTORY_LIMIT,
    refresh = false,
    contactList = [],
  }: {
    wallet: Wallet;
    transactionsHistory: any[];
    limit: number;
    refresh?: boolean;
    contactList?: any[];
  }): Effect<Promise<{transactions: any[]; loadMore: boolean}>> =>
  async (dispatch): Promise<{transactions: any[]; loadMore: boolean}> => {
    return new Promise(async (resolve, reject) => {
      let requestLimit = limit;

      const {walletId, keyId} = wallet.credentials;

      if (!walletId || !wallet.isComplete()) {
        return resolve({transactions: [], loadMore: false});
      }

      const lastTransactionId = transactionsHistory[0]
        ? transactionsHistory[0].txid
        : null;
      const skip = refresh ? 0 : transactionsHistory.length;

      if (wallet.transactionHistory?.transactions?.length && !refresh && !skip) {
        return resolve(wallet.transactionHistory);
      }

      try {
        let {transactions, loadMore} = await GetNewTransactions(
          [],
          skip,
          wallet,
          requestLimit,
          lastTransactionId,
        );

        // To get transaction list details: icon, description, amount and date
        transactions = BuildUiFriendlyList(
          transactions,
          wallet.currencyAbbreviation,
          contactList,
        );

        const array = transactionsHistory
          .concat(transactions)
          .filter((txs: any) => txs);

        const newHistory = uniqBy(array, x => {
          return (x as any).txid;
        });

        if (!skip) {
          dispatch(
            updateWalletTxHistory({
              walletId: walletId,
              keyId: keyId,
              transactionHistory: {
                transactions: newHistory.slice(0, TX_HISTORY_LIMIT),
                loadMore,
              },
            }),
          );
        }
        return resolve({transactions: newHistory, loadMore});
      } catch (err) {
        console.log(
          '!! Could not update transaction history for ',
          wallet.id,
          err,
        );
        return reject(err);
      }
    });
  };

//////////////////////// Edit Transaction Note ///////////////////////////

export interface NoteArgs {
  txid: string;
  body: string;
}

export const EditTxNote = (wallet: Wallet, args: NoteArgs): Promise<any> => {
  return new Promise((resolve, reject) => {
    wallet.editTxNote(args, (err: Error, res: any) => {
      if (err) {
        return reject(err);
      }
      return resolve(res);
    });
  });
};

/////////////////////// Transaction Helper Methods /////////////////////////////////////

export const GetContactName = (
  address: string | undefined,
  contactList: any[] = [],
) => {
  if (!address || !contactList.length) {
    return null;
  }
  const existsContact = contactList.find(
    contact => contact.address === address,
  );
  if (existsContact) {
    return existsContact.name;
  }
  return null;
};

const getFormattedDate = (time: number): string => {
  return WithinPastDay(time)
    ? moment(time).fromNow()
    : moment(time).format('MMM D, YYYY');
};

export const IsSent = (action: string): boolean => {
  return action === 'sent';
};

export const IsMoved = (action: string): boolean => {
  return action === 'moved';
};

export const IsReceived = (action: string): boolean => {
  return action === 'received';
};

export const IsInvalid = (action: string): boolean => {
  return action === 'invalid';
};

export const NotZeroAmountEth = (
  amount: number,
  currencyAbbreviation: string,
): boolean => {
  return !(amount === 0 && currencyAbbreviation === 'eth');
};

export const IsShared = (wallet: Wallet): boolean => {
  const {credentials} = wallet;
  return credentials.n > 1;
};

export const IsMultisigEthInfo = (wallet: Wallet): boolean => {
  const {credentials} = wallet;
  return !!credentials.multisigEthInfo;
};

/////////////////////// Transaction List /////////////////////////////////////

export const BuildUiFriendlyList = (
  transactionList: any[] = [],
  currencyAbbreviation: string,
  contactList: any[] = [],
): any[] => {
  return transactionList.map(transaction => {
    const {
      confirmations,
      error,
      customData,
      action,
      time,
      amount,
      amountStr,
      feeStr,
      outputs,
      note,
      message,
    } = transaction || {};
    const {service: customDataService, toWalletName} = customData || {};
    const {body: noteBody} = note || {};

    const notZeroAmountEth = NotZeroAmountEth(amount, currencyAbbreviation);
    let contactName;

    if (
      contactList?.length &&
      outputs?.length &&
      GetContactName(outputs[0]?.address, contactList)
    ) {
      contactName = GetContactName(outputs[0]?.address, contactList);
    }

    const isSent = IsSent(action);
    const isMoved = IsMoved(action);
    const isReceived = IsReceived(action);
    const isInvalid = IsInvalid(action);

    if (confirmations <= 0) {
      transaction.uiIcon = TransactionIcons.confirming;

      if (notZeroAmountEth) {
        if (contactName) {
          if (isSent || isMoved) {
            transaction.uiDescription = contactName;
          }
        } else {
          if (isSent) {
            transaction.uiDescription = 'Sending';
          }

          if (isMoved) {
            transaction.uiDescription = 'Moving';
          }
        }

        if (isReceived) {
          transaction.uiDescription = 'Receiving';
        }
      }
    }

    if (confirmations > 0) {
      if (
        (currencyAbbreviation === 'eth' ||
          IsCustomERCToken(currencyAbbreviation)) &&
        error
      ) {
        transaction.uiIcon = TransactionIcons.error;
      } else {
        if (isSent) {
          // TODO: Get giftCard images
          transaction.uiIcon = customDataService
            ? TransactionIcons[customDataService]
            : TransactionIcons.sent;

          if (notZeroAmountEth) {
            if (noteBody) {
              transaction.uiDescription = noteBody;
            } else if (message) {
              transaction.uiDescription = message;
            } else if (contactName) {
              transaction.uiDescription = contactName;
            } else if (toWalletName) {
              transaction.uiDescription = `Sent to ${toWalletName}`;
            } else {
              transaction.uiDescription = 'Sent';
            }
          }
        }

        if (isReceived) {
          transaction.uiIcon = TransactionIcons.received;

          if (noteBody) {
            transaction.uiDescription = noteBody;
          } else if (contactName) {
            transaction.uiDescription = contactName;
          } else {
            transaction.uiDescription = 'Received';
          }
        }

        if (isMoved) {
          transaction.uiIcon = TransactionIcons.moved;

          if (noteBody) {
            transaction.uiDescription = noteBody;
          } else if (message) {
            transaction.uiDescription = message;
          } else {
            transaction.uiDescription = 'Sent to self';
          }
        }

        if (isInvalid) {
          transaction.uiIcon = TransactionIcons.error;

          transaction.uiDescription = 'Invalid';
        }
      }
    }

    if (!notZeroAmountEth) {
      const {uiDescription} = transaction;

      transaction.uiDescription = uiDescription
        ? `Interaction with contract ${uiDescription}`
        : 'Interaction with contract';
      transaction.uiValue = feeStr;
    }

    if (isInvalid) {
      transaction.uiValue = '(possible double spend)';
    } else {
      if (notZeroAmountEth) {
        transaction.uiValue = amountStr;
      }
    }

    transaction.uiTime = getFormattedDate(time * 1000);

    return transaction;
  });
};

export const CanSpeedUpTx = (
  tx: any,
  currencyAbbreviation: string,
): boolean => {
  const isERC20Wallet = IsERCToken(currencyAbbreviation);
  const isEthWallet = currencyAbbreviation === 'eth';

  if (currencyAbbreviation !== 'btc' && isEthWallet && isERC20Wallet) {
    return false;
  }

  const {action, abiType, confirmations} = tx || {};
  const isERC20Transfer = abiType?.name === 'transfer';
  const isUnconfirmed = !confirmations || confirmations === 0;

  if ((isEthWallet && !isERC20Transfer) || (isERC20Wallet && isERC20Transfer)) {
    // Can speed up the eth/erc20 tx instantly
    return isUnconfirmed && (IsSent(action) || IsMoved(action));
  } else {
    const currentTime = moment();
    const txTime = moment(tx.time * 1000);

    // Can speed up the btc tx after 1 hours without confirming
    return (
      currentTime.diff(txTime, 'hours') >= 1 &&
      isUnconfirmed &&
      IsReceived(action) &&
      currencyAbbreviation === 'btc'
    );
  }
};

///////////////////////////////////////// Transaction Details ////////////////////////////////////////////////

export const getDetailsTitle = (transaction: any, wallet: Wallet) => {
  const {action, error} = transaction;
  const {currencyAbbreviation} = wallet;

  if (!IsInvalid(action)) {
    if (currencyAbbreviation === 'ETH' && error) {
      return 'Failed';
    } else if (IsSent(action)) {
      return 'Sent';
    } else if (IsReceived(action)) {
      return 'Received';
    } else if (IsMoved(action)) {
      return 'Sent to self';
    }
  }
};

export const buildTransactionDetails =
  ({
    transaction,
    wallet,
  }: {
    transaction: any;
    wallet: Wallet;
  }): Effect<Promise<any>> =>
  async dispatch => {
    return new Promise(async (resolve, reject) => {
      try {
        const _transaction = {...transaction};
        const {fees, amount, note, message, action, time, hasMultiplesOutputs} =
          transaction;
        const {currencyAbbreviation} = wallet;
        const currency = currencyAbbreviation.toLowerCase();

        // TODO: update alternative currency
        const alternativeCurrency = 'USD';

        const rates = await dispatch(startGetRates());

        _transaction.feeFiatStr = formatFiatAmount(
          toFiat(fees, alternativeCurrency, currency, rates),
          alternativeCurrency,
        );

        if (hasMultiplesOutputs) {
          if (action !== 'received') {
            _transaction.outputs = _transaction.outputs.map((o: any) => {
              o.alternativeAmountStr = formatFiatAmount(
                toFiat(o.amount, alternativeCurrency, currency, rates),
                alternativeCurrency,
              );
              return o;
            });
          }
        }

        if (IsUtxoCoin(currency)) {
          _transaction.feeRateStr =
            ((fees / (amount + fees)) * 100).toFixed(2) + '%';
          try {
            const minFee = getMinFee(wallet);
            _transaction.lowAmount = amount < minFee;
          } catch (minFeeErr) {
            console.log(minFeeErr);
          }
        }

        if (!note) {
          _transaction.detailsMemo = message;
        }

        if (note?.body) {
          _transaction.detailsMemo = note.body;
        }

        _transaction.actionsList = GetActionsList(transaction, wallet);

        const historicFiatRate = await getHistoricFiatRate(
          alternativeCurrency,
          currency,
          (time * 1000).toString(),
        );
        _transaction.fiatRateStr = UpdateFiatRate(
          historicFiatRate,
          transaction,
          rates,
          currency,
          alternativeCurrency,
        );

        resolve(_transaction);
      } catch (e) {
        return reject(e);
      }
    });
  };

const UpdateFiatRate = (
  historicFiatRate: HistoricRate,
  transaction: any,
  rates: Rates = {},
  currency: string,
  alternativeCurrency: string,
) => {
  const {amountValueStr, amount} = transaction;
  let fiatRateStr;
  if (historicFiatRate?.rate) {
    const {rate} = historicFiatRate;
    fiatRateStr =
      formatFiatAmount(
        parseFloat((rate * amountValueStr).toFixed(2)),
        alternativeCurrency,
      ) +
      ` @ ${formatFiatAmount(
        rate,
        alternativeCurrency,
      )} per ${currency.toUpperCase()}`;
  } else {
    // Get current fiat value when historic rates are unavailable
    fiatRateStr = toFiat(amount, alternativeCurrency, currency, rates);
    fiatRateStr =
      formatFiatAmount(fiatRateStr, alternativeCurrency) + alternativeCurrency;
  }
  return fiatRateStr;
};

// These 2 functions were taken from
// https://github.com/bitpay/bitcore-wallet-service/blob/master/lib/model/txproposal.js#L235
const getEstimatedSizeForSingleInput = (wallet: Wallet): number => {
  switch (wallet.credentials.addressType) {
    case 'P2PKH':
      return 147;
    default:
    case 'P2SH':
      return wallet.m * 72 + wallet.n * 36 + 44;
  }
};

const getEstimatedTxSize = (wallet: Wallet): number => {
  // Note: found empirically based on all multisig P2SH inputs and within m & n allowed limits.
  const nbOutputs = 2; // Assume 2 outputs
  const safetyMargin = 0.02;
  const overhead = 4 + 4 + 9 + 9;
  const inputSize = getEstimatedSizeForSingleInput(wallet);
  const outputSize = 34;
  const nbInputs = 1; // Assume 1 input

  const size = overhead + inputSize * nbInputs + outputSize * nbOutputs;
  return parseInt((size * (1 + safetyMargin)).toFixed(0), 10);
};

const getMinFee = (wallet: Wallet): Promise<any> => {
  return new Promise(async (resolve, reject) => {
    try {
      const feePerKb = await getFeeRatePerKb({wallet, feeLevel: 'normal'});
      const lowLevelRate: string = (feePerKb / 1000).toFixed(0);
      const size = getEstimatedTxSize(wallet);
      return resolve(size * parseInt(lowLevelRate, 10));
    } catch (e) {
      return reject(e);
    }
  });
};

export interface TxActions {
  type: string;
  time: number;
  description: string;
  by?: string;
}
const GetActionsList = (transaction: any, wallet: Wallet) => {
  const {actions, createdOn, creatorName, time, action} = transaction;
  if ((!IsSent(action) && !IsMoved(action)) || !IsShared(wallet)) {
    return;
  }

  const actionList: TxActions[] = [];

  let actionDescriptions: {[key in string]: string} = {
    created: 'Proposal Created',
    failed: 'Execution Failed',
    accept: 'Accepted',
    reject: 'Rejected',
    broadcasted: 'Broadcasted',
  };

  actionList.push({
    type: 'created',
    time: createdOn,
    description: actionDescriptions.created,
    by: creatorName,
  });

  actions.forEach((action: any) => {
    actionList.push({
      type: action.type,
      time: action.createdOn,
      description: actionDescriptions[action.type],
      by: action.copayerName,
    });
  });

  actionList.push({
    type: 'broadcasted',
    time,
    description: actionDescriptions.broadcasted,
  });

  return actionList.reverse();
};