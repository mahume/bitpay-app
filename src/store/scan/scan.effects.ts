import {WalletScreens} from '../../navigation/wallet/WalletStack';
import {navigationRef} from '../../Root';
import {Effect} from '../index';
import {GetPayProOptions} from '../wallet/effects/paypro/paypro';
import {
  ExtractBitPayUriAddress,
  GetPayProUrl,
} from '../wallet/utils/decode-uri';
import isEqual from 'lodash.isequal';
import {
  IsValidBitcoinAddress,
  IsValidBitcoinCashAddress,
  IsValidBitcoinCashUri,
  IsValidBitcoinCashUriWithLegacyAddress,
  IsValidBitcoinUri,
  IsValidBitPayInvoice,
  IsValidBitPayUri,
  IsValidDogecoinAddress,
  IsValidDogecoinUri,
  IsValidEthereumAddress,
  IsValidEthereumUri,
  IsValidImportPrivateKey,
  IsValidJoinCode,
  IsValidLitecoinAddress,
  IsValidLitecoinUri,
  IsValidPayPro,
  IsValidRippleAddress,
  IsValidRippleUri,
  isValidSimplexUri,
  isValidWalletConnectUri,
  isValidWyreUri,
} from '../wallet/utils/validations';
import {APP_NAME} from '../../constants/config';
import {BuyCryptoActions} from '../buy-crypto';
import {
  simplexIncomingData,
  wyrePaymentData,
} from '../buy-crypto/buy-crypto.models';
import {LogActions} from '../log';
import {logSegmentEvent, startOnGoingProcessModal} from '../app/app.effects';
import {OnGoingProcessMessages} from '../../components/modal/ongoing-process/OngoingProcess';
import {
  dismissOnGoingProcessModal,
  showBottomNotificationModal,
} from '../app/app.actions';
import {sleep} from '../../utils/helper-methods';
import {BwcProvider} from '../../lib/bwc';
import {
  createProposalAndBuildTxDetails,
  handleCreateTxProposalError,
} from '../wallet/effects/send/send';
import {Key, Wallet} from '../wallet/wallet.models';
import {FormatAmount} from '../wallet/effects/amount/amount';
import {ButtonState} from '../../components/button/Button';
import {InteractionManager, Linking} from 'react-native';
import {
  BitcoreLibs,
  bitcoreLibs,
  GetAddressNetwork,
} from '../wallet/effects/address/address';
import {Network} from '../../constants';
import BitPayIdApi from '../../api/bitpay';
import axios from 'axios';
import {t} from 'i18next';
import {GeneralError} from '../../navigation/wallet/components/ErrorMessages';

export const incomingData =
  (
    data: string,
    opts?: {wallet?: Wallet; context?: string; name?: string},
  ): Effect<Promise<void>> =>
  async dispatch => {
    const coin = opts?.wallet?.currencyAbbreviation?.toLowerCase();
    try {
      if (IsValidBitPayInvoice(data)) {
        dispatch(handleUnlock(data));
      }
      // Paypro
      else if (IsValidPayPro(data)) {
        dispatch(goToPayPro(data));
        // Bitcoin  URI
      } else if (IsValidBitcoinUri(data)) {
        dispatch(handleBitcoinUri(data, opts?.wallet));
        // Bitcoin Cash URI
      } else if (IsValidBitcoinCashUri(data)) {
        dispatch(handleBitcoinCashUri(data, opts?.wallet));
        // Bitcoin Cash URI using Bitcoin Core legacy address
      } else if (IsValidBitcoinCashUriWithLegacyAddress(data)) {
        dispatch(handleBitcoinCashUriLegacyAddress(data, opts?.wallet));
        // Ethereum URI
      } else if (IsValidEthereumUri(data)) {
        dispatch(handleEthereumUri(data, opts?.wallet));
        // Ripple URI
      } else if (IsValidRippleUri(data)) {
        dispatch(handleRippleUri(data, opts?.wallet));
        // Dogecoin URI
      } else if (IsValidDogecoinUri(data)) {
        dispatch(handleDogecoinUri(data, opts?.wallet));
        // Litecoin URI
      } else if (IsValidLitecoinUri(data)) {
        dispatch(handleLitecoinUri(data, opts?.wallet));
        // Wallet Connect URI
      } else if (isValidWalletConnectUri(data)) {
        handleWalletConnectUri(data);
        // Simplex
      } else if (isValidSimplexUri(data)) {
        dispatch(handleSimplexUri(data));
        // Wyre
      } else if (isValidWyreUri(data)) {
        dispatch(handleWyreUri(data));
        // BitPay URI
      } else if (IsValidBitPayUri(data)) {
        dispatch(handleBitPayUri(data, opts?.wallet));
        // Plain Address (Bitcoin)
      } else if (IsValidBitcoinAddress(data)) {
        dispatch(handlePlainAddress(data, coin || 'btc', opts));
        // Plain Address (Bitcoin Cash)
      } else if (IsValidBitcoinCashAddress(data)) {
        dispatch(handlePlainAddress(data, coin || 'bch', opts));
        // Address (Ethereum)
      } else if (IsValidEthereumAddress(data)) {
        dispatch(handlePlainAddress(data, coin || 'eth', opts));
        // Address (Ripple)
      } else if (IsValidRippleAddress(data)) {
        dispatch(handlePlainAddress(data, coin || 'xrp', opts));
        // Plain Address (Doge)
      } else if (IsValidDogecoinAddress(data)) {
        dispatch(handlePlainAddress(data, coin || 'doge', opts));
        // Plain Address (Litecoin)
      } else if (IsValidLitecoinAddress(data)) {
        dispatch(handlePlainAddress(data, coin || 'ltc', opts));
        // Import Private Key
      } else if (IsValidImportPrivateKey(data)) {
        goToImport(data);
        // Join multisig wallet
      } else if (IsValidJoinCode(data)) {
        dispatch(goToJoinWallet(data));
      }
    } catch (err) {
      dispatch(dismissOnGoingProcessModal());
      await sleep(300);
      throw err;
    }
  };

const getParameterByName = (name: string, url: string): string | undefined => {
  if (!url) {
    return undefined;
  }
  name = name.replace(/[\[\]]/g, '\\$&');
  const regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)');
  const results = regex.exec(url);
  if (!results) {
    return undefined;
  }
  if (!results[2]) {
    return '';
  }
  return decodeURIComponent(results[2].replace(/\+/g, ' '));
};

const goToPayPro =
  (data: string): Effect =>
  async dispatch => {
    dispatch(
      startOnGoingProcessModal(OnGoingProcessMessages.FETCHING_PAYMENT_OPTIONS),
    );

    const payProUrl = GetPayProUrl(data);

    try {
      const payProOptions = await GetPayProOptions(payProUrl);
      dispatch(dismissOnGoingProcessModal());

      InteractionManager.runAfterInteractions(() => {
        navigationRef.navigate('Wallet', {
          screen: WalletScreens.PAY_PRO_CONFIRM,
          params: {
            payProOptions,
          },
        });
      });
    } catch (e: any) {
      dispatch(dismissOnGoingProcessModal());
      await sleep(400);

      dispatch(
        showBottomNotificationModal({
          type: 'warning',
          title: 'Something went wrong',
          message: e?.message,
          enableBackdropDismiss: true,
          actions: [
            {
              text: 'OK',
              action: () => {},
              primary: true,
            },
          ],
        }),
      );
    }
  };

const handleUnlock =
  (data: string): Effect =>
  async (dispatch, getState) => {
    const invoiceId = data.split('i/')[1].split('?')[0];
    const network = data.includes('test') ? Network.testnet : Network.mainnet;
    const result = await dispatch(unlockInvoice(invoiceId, network));

    if (result === 'unlockSuccess') {
      dispatch(goToPayPro(data));
      return;
    }

    const {host} = new URL(GetPayProUrl(data));
    try {
      const invoice = await axios.get(
        `https://${host}/invoiceData/${invoiceId}`,
      );
      if (invoice) {
        dispatch(goToPayPro(data));
        return;
      }
    } catch {}
    switch (result) {
      case 'pairingRequired':
        navigationRef.navigate('Auth', {
          screen: 'Login',
          params: {
            onLoginSuccess: () => {
              const parentNav = navigationRef.getParent();

              if (parentNav?.canGoBack()) {
                parentNav.goBack();
              } else {
                navigationRef.navigate('Tabs', {screen: 'Home'});
              }

              dispatch(incomingData(data));
            },
          },
        });
        break;

      // needs verification - send to bitpay id verify
      case 'userShopperNotFound':
      case 'tierNotMet':
        dispatch(
          showBottomNotificationModal({
            type: 'warning',
            title: t('Connect Your BitPay ID'),
            enableBackdropDismiss: false,
            message: t(
              'To complete this payment, please login with your BitPay ID.',
            ),
            actions: [
              {
                text: t('CONTINUE'),
                action: () => {
                  Linking.openURL(
                    `https://${host}/id/verify?context=unlockAppV&id=${invoiceId}`,
                  );
                },
              },
              {
                text: t('Cancel'),
                action: () => {},
              },
            ],
          }),
        );
        break;
      default:
        dispatch(showBottomNotificationModal(GeneralError()));
        break;
    }
  };

const unlockInvoice =
  (invoiceId: string, network: Network): Effect<Promise<string>> =>
  async (dispatch, getState) => {
    const {BITPAY_ID} = getState();
    const token = BITPAY_ID.apiToken[network];

    const isPaired = !!token && token !== '';
    if (!isPaired) {
      return 'pairingRequired';
    }

    try {
      const tokens = (await BitPayIdApi.getInstance()
        .request('getProductTokens', token)
        .then(res => {
          if (res.data.error) {
            throw new Error(res.data.error);
          }
          return res.data;
        })) as any;

      const {token: userShopperToken} = tokens.find(
        ({facade}: {facade: string}) => facade === 'userShopper',
      );

      if (!userShopperToken) {
        return 'userShopperNotFound';
      }

      try {
        const unlockInvoiceResponse = await BitPayIdApi.getInstance()
          .request('unlockInvoice', userShopperToken, {invoiceId})
          .then(res => {
            if (res.data.error) {
              throw new Error(res.data.error);
            }

            return res.data;
          });

        const {data} = unlockInvoiceResponse as {data: any};
        const {meetsRequiredTier} = data;

        if (!meetsRequiredTier) {
          return 'tierNotMet';
        }

        return 'unlockSuccess';
      } catch (e) {
        return 'invalidInvoice';
      }
    } catch (e) {
      return 'somethingWentWrong';
    }
  };

const goToConfirm =
  ({
    recipient,
    amount,
    wallet,
    setButtonState,
    opts,
  }: {
    recipient: {type: string; address: string; currency: string};
    amount: number;
    wallet?: Wallet;
    setButtonState?: (state: ButtonState) => void;
    opts?: {
      sendMax?: boolean | undefined;
      message?: string;
      feePerKb?: number;
      destinationTag?: string;
    };
  }): Effect<Promise<void>> =>
  async (dispatch, getState) => {
    try {
      if (!wallet) {
        navigationRef.navigate('Wallet', {
          screen: 'GlobalSelect',
          params: {
            context: 'scanner',
            recipient: {
              ...recipient,
              ...{
                opts: {
                  showERC20Tokens: recipient.currency.toLowerCase() === 'eth', // no wallet selected - if ETH address show token wallets in next view
                },
              },
            },
            amount,
          },
        });
        return Promise.resolve();
      }

      if (setButtonState) {
        setButtonState('loading');
      } else {
        dispatch(startOnGoingProcessModal(OnGoingProcessMessages.CREATING_TXP));
      }

      const {txDetails, txp} = await dispatch(
        createProposalAndBuildTxDetails({
          wallet,
          recipient,
          amount,
          ...opts,
        }),
      );
      if (setButtonState) {
        setButtonState('success');
      } else {
        dispatch(dismissOnGoingProcessModal());
      }
      await sleep(300);
      navigationRef.navigate('Wallet', {
        screen: 'Confirm',
        params: {
          wallet,
          recipient,
          txp,
          txDetails,
          amount,
        },
      });
    } catch (err: any) {
      if (setButtonState) {
        setButtonState('failed');
      } else {
        dispatch(dismissOnGoingProcessModal());
      }
      const [errorMessageConfig] = await Promise.all([
        dispatch(handleCreateTxProposalError(err)),
        sleep(400),
      ]);
      dispatch(
        showBottomNotificationModal({
          ...errorMessageConfig,
          enableBackdropDismiss: false,
          actions: [
            {
              text: 'OK',
              action: () => {
                if (setButtonState) {
                  setButtonState(undefined);
                }
              },
            },
          ],
        }),
      );
    }
  };

export const goToAmount =
  ({
    coin,
    recipient,
    wallet,
    opts: urlOpts,
  }: {
    coin: string;
    recipient: {
      type: string;
      address: string;
      currency: string;
      network?: Network;
    };
    wallet?: Wallet;
    opts?: {
      message?: string;
      feePerKb?: number;
      destinationTag?: string;
    };
  }): Effect<Promise<void>> =>
  async (dispatch, getState) => {
    if (!wallet) {
      navigationRef.navigate('Wallet', {
        screen: 'GlobalSelect',
        params: {
          context: 'scanner',
          recipient: {
            ...recipient,
            ...{
              opts: {
                showERC20Tokens: recipient.currency.toLowerCase() === 'eth', // no wallet selected - if ETH address show token wallets in next view
              },
            },
          },
        },
      });
      return Promise.resolve();
    }

    navigationRef.navigate('Wallet', {
      screen: WalletScreens.AMOUNT,
      params: {
        currencyAbbreviationRouteParam: coin.toUpperCase(),
        onAmountSelected: async (amount, setButtonState, amountOpts) => {
          dispatch(
            goToConfirm({
              recipient,
              amount: Number(amount),
              wallet,
              setButtonState,
              opts: {...urlOpts, ...amountOpts},
            }),
          );
        },
      },
    });
  };

const handleBitPayUri =
  (data: string, wallet?: Wallet): Effect<void> =>
  (dispatch, getState) => {
    console.log('### Incoming-data: BitPay URI');

    // From Braze (push notifications)
    if (data.indexOf('bitpay://wallet?') === 0) {
      const params: URLSearchParams = new URLSearchParams(
        data.replace('bitpay://wallet?', ''),
      );
      const walletIdHashed = params.get('walletId')!;
      const tokenAddress = params.get('tokenAddress');
      const multisigContractAddress = params.get('multisigContractAddress');

      const keys = Object.values(getState().WALLET.keys);

      const fullWalletObj = findWallet(
        keys,
        walletIdHashed,
        tokenAddress,
        multisigContractAddress,
      );

      if (fullWalletObj) {
        navigationRef.navigate('Wallet', {
          screen: WalletScreens.WALLET_DETAILS,
          params: {
            walletId: fullWalletObj.credentials.walletId,
          },
        });
      }
    } else {
      const address = ExtractBitPayUriAddress(data);
      const params: URLSearchParams = new URLSearchParams(
        data.replace(`bitpay:${address}`, ''),
      );
      const message = params.get('message') || undefined;
      let feePerKb;
      const coin = params.get('coin')!;

      if (params.get('gasPrice')) {
        feePerKb = Number(params.get('gasPrice'));
      }
      const recipient = {
        type: 'address',
        currency: coin,
        address,
      };

      if (!params.get('amount')) {
        dispatch(goToAmount({coin, recipient, wallet, opts: {message}}));
      } else {
        const amount = Number(params.get('amount'));
        dispatch(
          goToConfirm({
            recipient,
            amount,
            wallet,
            opts: {message, feePerKb},
          }),
        );
      }
    }
  };

const handleBitcoinUri =
  (data: string, wallet?: Wallet): Effect<void> =>
  (dispatch, getState) => {
    console.log('Incoming-data: Bitcoin URI');
    const coin = 'btc';
    const parsed = BwcProvider.getInstance().getBitcore().URI(data);
    const address = parsed.address ? parsed.address.toString() : '';
    const message = parsed.message;
    const recipient = {
      type: 'address',
      currency: coin,
      address,
      network: address && GetAddressNetwork(address, coin),
    };
    if (parsed.r) {
      dispatch(goToPayPro(parsed.r));
    } else if (!parsed.amount) {
      dispatch(goToAmount({coin, recipient, wallet, opts: {message}}));
    } else {
      const amount = Number(dispatch(FormatAmount(coin, parsed.amount)));
      dispatch(goToConfirm({recipient, amount, wallet, opts: {message}}));
    }
  };

const handleBitcoinCashUri =
  (data: string, wallet?: Wallet): Effect<void> =>
  (dispatch, getState) => {
    console.log('Incoming-data: BitcoinCash URI');
    const coin = 'bch';
    const parsed = BwcProvider.getInstance().getBitcoreCash().URI(data);
    const message = parsed.message;
    let address = parsed.address ? parsed.address.toString() : '';

    // keep address in original format
    if (parsed.address && data.indexOf(address) < 0) {
      address = parsed.address.toCashAddress();
    }

    const recipient = {
      type: 'address',
      currency: coin,
      address,
      network: address && GetAddressNetwork(address, coin),
    };
    if (parsed.r) {
      dispatch(goToPayPro(parsed.r));
    } else if (!parsed.amount) {
      dispatch(goToAmount({coin, recipient, wallet, opts: {message}}));
    } else {
      const amount = Number(dispatch(FormatAmount(coin, parsed.amount)));
      dispatch(goToConfirm({recipient, amount, wallet, opts: {message}}));
    }
  };

const handleBitcoinCashUriLegacyAddress =
  (data: string, wallet?: Wallet): Effect<void> =>
  (dispatch, getState) => {
    console.log('Incoming-data: Bitcoin Cash URI with legacy address');
    const coin = 'bch';
    const parsed = BwcProvider.getInstance()
      .getBitcore()
      .URI(data.replace(/^(bitcoincash:|bchtest:)/, 'bitcoin:'));

    const oldAddr = parsed.address ? parsed.address.toString() : '';
    if (!oldAddr) {
      console.log('Could not parse Bitcoin Cash legacy address');
    }

    const a = BwcProvider.getInstance()
      .getBitcore()
      .Address(oldAddr)
      .toObject();
    const address = BwcProvider.getInstance()
      .getBitcoreCash()
      .Address.fromObject(a)
      .toString();
    const message = parsed.message;

    // Translate address
    console.log('Legacy Bitcoin Address translated to: ' + address);
    const recipient = {
      type: 'address',
      currency: coin,
      address,
      network: address && GetAddressNetwork(address, coin),
    };
    if (parsed.r) {
      dispatch(goToPayPro(parsed.r));
    } else if (!parsed.amount) {
      dispatch(goToAmount({coin, recipient, wallet, opts: {message}}));
    } else {
      const amount = Number(dispatch(FormatAmount(coin, parsed.amount)));
      dispatch(goToConfirm({recipient, amount, wallet, opts: {message}}));
    }
  };

const handleEthereumUri =
  (data: string, wallet?: Wallet): Effect<void> =>
  (dispatch, getState) => {
    console.log('Incoming-data: Ethereum URI');
    const coin = 'eth';
    const value = /[\?\&]value=(\d+([\,\.]\d+)?)/i;
    const gasPrice = /[\?\&]gasPrice=(\d+([\,\.]\d+)?)/i;
    let feePerKb;
    if (gasPrice.exec(data)) {
      feePerKb = Number(gasPrice.exec(data)![1]);
    }
    const address = ExtractBitPayUriAddress(data);
    const recipient = {
      type: 'address',
      currency: coin,
      address,
    };
    if (!value.exec(data)) {
      dispatch(goToAmount({coin, recipient, wallet, opts: {feePerKb}}));
    } else {
      const parsedAmount = value.exec(data)![1];
      const amount = Number(dispatch(FormatAmount(coin, Number(parsedAmount))));
      dispatch(
        goToConfirm({
          recipient,
          amount,
          wallet,
          opts: {feePerKb},
        }),
      );
    }
  };

const handleRippleUri =
  (data: string, wallet?: Wallet): Effect<void> =>
  (dispatch, getState) => {
    console.log('Incoming-data: Ripple URI');
    const coin = 'xrp';
    const amountParam = /[\?\&]amount=(\d+([\,\.]\d+)?)/i;
    const tagParam = /[\?\&]dt=(\d+([\,\.]\d+)?)/i;
    let destinationTag;

    if (tagParam.exec(data)) {
      destinationTag = tagParam.exec(data)![1];
    }
    const address = ExtractBitPayUriAddress(data);
    const recipient = {
      type: 'address',
      currency: coin,
      address,
    };
    if (!amountParam.exec(data)) {
      dispatch(goToAmount({coin, recipient, wallet, opts: {destinationTag}}));
    } else {
      const parsedAmount = amountParam.exec(data)![1];
      const amount = Number(parsedAmount);
      dispatch(
        goToConfirm({
          recipient,
          amount,
          wallet,
          opts: {destinationTag},
        }),
      );
    }
  };

const handleDogecoinUri =
  (data: string, wallet?: Wallet): Effect<void> =>
  (dispatch, getState) => {
    console.log('Incoming-data: Dogecoin URI');
    const coin = 'doge';
    const parsed = BwcProvider.getInstance().getBitcoreDoge().URI(data);
    const address = parsed.address ? parsed.address.toString() : '';
    const message = parsed.message;

    const recipient = {
      type: 'address',
      currency: coin,
      address,
      network: address && GetAddressNetwork(address, coin),
    };

    if (parsed.r) {
      dispatch(goToPayPro(parsed.r));
    } else if (!parsed.amount) {
      dispatch(goToAmount({coin, recipient, wallet, opts: {message}}));
    } else {
      const amount = Number(dispatch(FormatAmount(coin, parsed.amount)));
      dispatch(goToConfirm({recipient, amount, wallet, opts: {message}}));
    }
  };

const handleLitecoinUri =
  (data: string, wallet?: Wallet): Effect<void> =>
  (dispatch, getState) => {
    console.log('Incoming-data: Litecoin URI');
    const coin = 'ltc';
    const parsed = BwcProvider.getInstance().getBitcoreLtc().URI(data);
    const address = parsed.address ? parsed.address.toString() : '';
    const message = parsed.message;

    const recipient = {
      type: 'address',
      currency: coin,
      address,
      network: address && GetAddressNetwork(address, coin),
    };
    if (parsed.r) {
      dispatch(goToPayPro(parsed.r));
    } else if (!parsed.amount) {
      dispatch(goToAmount({coin, recipient, wallet, opts: {message}}));
    } else {
      const amount = Number(dispatch(FormatAmount(coin, parsed.amount)));
      dispatch(goToConfirm({recipient, amount, wallet, opts: {message}}));
    }
  };

const handleSimplexUri =
  (data: string): Effect<void> =>
  (dispatch, getState) => {
    dispatch(LogActions.info('Incoming-data (redirect): Simplex URL: ' + data));

    const res = data.replace(new RegExp('&amp;', 'g'), '&');
    const paymentId = getParameterByName('paymentId', res);
    if (!paymentId) {
      dispatch(LogActions.warn('No paymentId present. Do not redir'));
      return;
    }

    const success = getParameterByName('success', res);
    const quoteId = getParameterByName('quoteId', res);
    const userId = getParameterByName('userId', res);

    const stateParams: simplexIncomingData = {
      success,
      paymentId,
      quoteId,
      userId,
    };

    dispatch(
      BuyCryptoActions.updatePaymentRequestSimplex({
        simplexIncomingData: stateParams,
      }),
    );

    const {BUY_CRYPTO} = getState();
    const order = BUY_CRYPTO.simplex[paymentId];

    dispatch(
      logSegmentEvent(
        'track',
        'Successfully Complete Crypto Purchase',
        {
          exchange: 'simplex',
          fiatAmount: order?.fiat_total_amount || '',
          fiatCurrency: order?.fiat_total_amount_currency || '',
          coin: order?.coin || '',
        },
        true,
      ),
    );

    navigationRef.navigate('ExternalServicesSettings', {
      screen: 'SimplexSettings',
      params: {
        incomingPaymentRequest: stateParams,
      },
    });
  };

const handleWyreUri =
  (data: string): Effect<void> =>
  (dispatch, getState) => {
    dispatch(LogActions.info('Incoming-data (redirect): Wyre URL: ' + data));

    if (data.indexOf(APP_NAME + '://wyreError') >= 0) {
      navigationRef.navigate('ExternalServicesSettings', {
        screen: 'WyreSettings',
        params: {
          paymentRequestError: true,
        },
      });
      return;
    }

    if (data === APP_NAME + '://wyre') {
      return;
    }
    const res = data.replace(new RegExp('&amp;', 'g'), '&');
    const orderId = getParameterByName('id', res);
    if (!orderId) {
      dispatch(LogActions.warn('No orderId present. Do not redir'));
      return;
    }

    const walletId = getParameterByName('walletId', res);
    const destCurrency = getParameterByName('destCurrency', res);
    const sourceCurrency = getParameterByName('sourceCurrency', res);
    const sourceAmount = getParameterByName('sourceAmount', res);

    const stateParams: wyrePaymentData = {
      orderId,
      transferId: getParameterByName('transferId', res),
      owner: getParameterByName('owner', res),
      accountId: getParameterByName('accountId', res),
      walletId,
      dest: getParameterByName('dest', res),
      destAmount: getParameterByName('destAmount', res),
      destCurrency,
      purchaseAmount: getParameterByName('purchaseAmount', res),
      sourceAmount,
      sourceCurrency,
      status: getParameterByName('status', res),
      createdAt: getParameterByName('createdAt', res),
      paymentMethodName: getParameterByName('paymentMethodName', res),
      blockchainNetworkTx: getParameterByName('blockchainNetworkTx', res),
      env: __DEV__ ? 'dev' : 'prod',
      created_on: Date.now(),
    };

    dispatch(
      BuyCryptoActions.successPaymentRequestWyre({
        wyrePaymentData: stateParams,
      }),
    );

    dispatch(
      logSegmentEvent(
        'track',
        'Successfully Complete Crypto Purchase',
        {
          exchange: 'wyre',
          fiatAmount: sourceAmount || '',
          fiatCurrency: sourceCurrency || '',
          coin: destCurrency || '',
        },
        true,
      ),
    );

    navigationRef.navigate('ExternalServicesSettings', {
      screen: 'WyreSettings',
      params: {
        incomingPaymentRequest: stateParams,
      },
    });
  };

const handleWalletConnectUri = (data: string) => {
  navigationRef.navigate('WalletConnect', {
    screen: 'Root',
    params: {
      uri: data,
    },
  });
};

const handlePlainAddress =
  (
    address: string,
    coin: string,
    opts?: {wallet?: Wallet; context?: string; name?: string},
  ): Effect<void> =>
  dispatch => {
    console.log(`Incoming-data: ${coin} plain address`);
    const network = Object.keys(bitcoreLibs).includes(coin)
      ? GetAddressNetwork(address, coin as keyof BitcoreLibs)
      : undefined; // There is no way to tell if an eth address is kovan or livenet so let's skip the network filter
    const recipient = {
      type: opts?.context || 'address',
      name: opts?.name,
      currency: coin,
      address,
      network,
    };
    dispatch(goToAmount({coin, recipient, wallet: opts?.wallet}));
  };

const goToImport = (importQrCodeData: string): void => {
  navigationRef.navigate('Wallet', {
    screen: WalletScreens.IMPORT,
    params: {
      importQrCodeData,
    },
  });
};

const goToJoinWallet =
  (data: string): Effect<void> =>
  (dispatch, getState) => {
    console.log('Incoming-data (redirect): Code to join to a multisig wallet');
    const keys = Object.values(getState().WALLET.keys);
    if (!keys.length) {
      navigationRef.navigate('Wallet', {
        screen: 'JoinMultisig',
        params: {
          invitationCode: data,
        },
      });
    } else if (keys.length === 1) {
      navigationRef.navigate('Wallet', {
        screen: 'JoinMultisig',
        params: {
          key: keys[0],
          invitationCode: data,
        },
      });
    } else {
      navigationRef.navigate('Wallet', {
        screen: 'KeyGlobalSelect',
        params: {
          context: 'join',
          invitationCode: data,
        },
      });
    }
  };

const findWallet = (
  keys: Key[],
  walletIdHashed: string,
  tokenAddress: string | null,
  multisigContractAddress?: string | null,
) => {
  let walletIdHash;
  const sjcl = BwcProvider.getInstance().getSJCL();

  const wallets = Object.values(keys).flatMap(k => k.wallets);

  const wallet = wallets.find(w => {
    if (tokenAddress || multisigContractAddress) {
      const walletId = w.credentials.walletId;
      const lastHyphenPosition = walletId.lastIndexOf('-');
      const walletIdWithoutTokenAddress = walletId.substring(
        0,
        lastHyphenPosition,
      );
      walletIdHash = sjcl.hash.sha256.hash(walletIdWithoutTokenAddress);
    } else {
      walletIdHash = sjcl.hash.sha256.hash(w.credentials.walletId);
    }
    return isEqual(walletIdHashed, sjcl.codec.hex.fromBits(walletIdHash));
  });

  return wallet;
};
