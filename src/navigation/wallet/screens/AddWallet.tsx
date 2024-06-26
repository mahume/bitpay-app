import React, {useCallback, useEffect, useLayoutEffect, useState} from 'react';
import {
  BaseText,
  H4,
  HeaderTitle,
  InfoDescription,
  InfoHeader,
  InfoTitle,
  Link,
  TextAlign,
} from '../../../components/styled/Text';
import styled from 'styled-components/native';
import {KeyboardAwareScrollView} from 'react-native-keyboard-aware-scroll-view';
import {
  ActiveOpacity,
  AdvancedOptionsButton,
  AdvancedOptionsButtonText,
  AdvancedOptionsContainer,
  AdvancedOptions,
  Column,
  SheetContainer,
  Row,
  ScreenGutter,
  Info,
  InfoTriangle,
  InfoImageContainer,
} from '../../../components/styled/Containers';
import {Key, Token, Wallet} from '../../../store/wallet/wallet.models';
import BoxInput from '../../../components/form/BoxInput';
import Button from '../../../components/button/Button';
import {
  openUrlWithInAppBrowser,
  startOnGoingProcessModal,
} from '../../../store/app/app.effects';
import {
  dismissBottomNotificationModal,
  dismissOnGoingProcessModal,
  showBottomNotificationModal,
} from '../../../store/app/app.actions';
import {
  addWallet,
  getDecryptPassword,
  startGetRates,
} from '../../../store/wallet/effects';
import {Controller, useForm} from 'react-hook-form';
import {yupResolver} from '@hookform/resolvers/yup';
import yup from '../../../lib/yup';
import {buildUIFormattedWallet} from './KeyOverview';
import {
  LightBlack,
  NeutralSlate,
  SlateDark,
  White,
} from '../../../styles/colors';
import {CurrencyImage} from '../../../components/currency-image/CurrencyImage';
import {
  CurrencyListIcons,
  SupportedCurrencyOptions,
  SupportedEvmCurrencyOptions,
} from '../../../constants/SupportedCurrencyOptions';
import SheetModal from '../../../components/modal/base/sheet/SheetModal';
import WalletRow, {WalletRowProps} from '../../../components/list/WalletRow';
import {FlatList, Keyboard, View, TouchableOpacity} from 'react-native';
import {
  getAccount,
  getProtocolName,
  keyExtractor,
  sleep,
} from '../../../utils/helper-methods';
import haptic from '../../../components/haptic-feedback/haptic';
import Haptic from '../../../components/haptic-feedback/haptic';
import Icons from '../components/WalletIcons';
import ChevronUpSvg from '../../../../assets/img/chevron-up.svg';
import ChevronDownSvg from '../../../../assets/img/chevron-down.svg';
import Checkbox from '../../../components/checkbox/Checkbox';
import {Network} from '../../../constants';
import {useAppDispatch, useAppSelector} from '../../../utils/hooks';
import {WrongPasswordError} from '../components/ErrorMessages';
import {
  getTokenContractInfo,
  startUpdateAllWalletStatusForKey,
} from '../../../store/wallet/effects/status/status';
import {
  createWalletAddress,
  GetCoinAndNetwork,
} from '../../../store/wallet/effects/address/address';
import {addCustomTokenOption} from '../../../store/wallet/effects/currencies/currencies';
import {
  BitpaySupportedCoins,
  SUPPORTED_EVM_COINS,
} from '../../../constants/currencies';
import InfoSvg from '../../../../assets/img/info.svg';
import {URL} from '../../../constants';
import {useTranslation} from 'react-i18next';
import {BitpayIdScreens} from '../../bitpay-id/BitpayIdGroup';
import {IsERCToken, IsSegwitCoin} from '../../../store/wallet/utils/currency';
import {updatePortfolioBalance} from '../../../store/wallet/wallet.actions';
import {LogActions} from '../../../store/log';
import CurrencySelectionRow from '../../../components/list/CurrencySelectionRow';
import {CommonActions} from '@react-navigation/native';
import {Analytics} from '../../../store/analytics/analytics.effects';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {WalletGroupParamList, WalletScreens} from '../WalletGroup';
import {RootStacks, getNavigationTabName} from '../../../Root';

export type AddWalletParamList = {
  key: Key;
  chain?: string;
  currencyAbbreviation?: string;
  currencyName?: string;
  isToken?: boolean;
  isCustomToken?: boolean;
  tokenAddress?: string;
};

const CreateWalletContainer = styled.SafeAreaView`
  flex: 1;
`;

const ScrollView = styled(KeyboardAwareScrollView)`
  margin-top: 20px;
  padding: 0 ${ScreenGutter};
`;

const ButtonContainer = styled.View`
  margin-top: 40px;
`;

const AssociatedWalletContainer = styled.View`
  margin-top: 20px;
  position: relative;
`;

const AssociatedWallet = styled.TouchableOpacity`
  background: ${({theme}) => (theme.dark ? LightBlack : NeutralSlate)};
  padding: 0 20px;
  height: 55px;
  border: 1px solid ${({theme}) => (theme.dark ? LightBlack : NeutralSlate)};
  border-top-left-radius: 4px;
  border-top-right-radius: 4px;
`;

const Label = styled(BaseText)`
  font-size: 13px;
  padding: 2px 0;
  font-weight: 500;
  line-height: 18px;
  color: ${({theme}) => (theme && theme.dark ? theme.colors.text : '#434d5a')};
`;

const AssociateWalletName = styled(BaseText)`
  font-size: 16px;
  font-style: normal;
  font-weight: 500;
  margin-left: 10px;
  color: #9ba3ae;
`;

const AssociatedWalletSelectionModalContainer = styled(SheetContainer)`
  padding: 15px;
  min-height: 200px;
`;

const schema = yup.object().shape({
  walletName: yup.string().required('Wallet name is required').trim(),
});

const CheckBoxContainer = styled.View`
  flex-direction: column;
  justify-content: center;
`;

const OptionTitle = styled(BaseText)`
  font-size: 16px;
  color: ${({theme: {dark}}) => (dark ? White : SlateDark)};
`;

const RowContainer = styled.TouchableOpacity`
  flex-direction: row;
  align-items: center;
  padding: 18px;
`;

const RowChooseAccountContainer = styled.TouchableOpacity`
  flex-direction: row;
  align-items: center;
  padding-top: 20px;
`;

const WalletAdvancedOptionsContainer = styled(AdvancedOptionsContainer)`
  margin-top: 20px;
`;

const VerticalPadding = styled.View`
  padding: ${ScreenGutter} 0;
`;

const isWithinReceiveSettings = (parent: any): boolean => {
  return parent
    ?.getState()
    .routes.some(
      (r: any) => r.params?.screen === BitpayIdScreens.RECEIVE_SETTINGS,
    );
};

const AddWallet = ({
  route,
  navigation,
}: NativeStackScreenProps<WalletGroupParamList, WalletScreens.ADD_WALLET>) => {
  const {t} = useTranslation();
  const dispatch = useAppDispatch();
  const {
    currencyAbbreviation: _currencyAbbreviation,
    currencyName: _currencyName,
    chain: _chain,
    tokenAddress: _tokenAddress,
    key,
    isToken,
    isCustomToken,
  } = route.params;
  // temporary until advanced settings is finished
  const [showOptions, setShowOptions] = useState(false);
  const [isTestnet, setIsTestnet] = useState(false);
  const [isRegtest, setIsRegtest] = useState(false);
  const [singleAddress, setSingleAddress] = useState(false);
  const defaultAltCurrency = useAppSelector(({APP}) => APP.defaultAltCurrency);
  const hideAllBalances = useAppSelector(({APP}) => APP.hideAllBalances);
  const network = useAppSelector(({APP}) => APP.network);
  const rates = useAppSelector(({RATE}) => RATE.rates);
  const [tokenAddress, setTokenAddress] = useState<string | undefined>(
    _tokenAddress,
  );
  const [currencyName, setCurrencyName] = useState(_currencyName);
  const [currencyAbbreviation, setCurrencyAbbreviation] = useState(
    _currencyAbbreviation,
  );
  const [chain, setChain] = useState(
    _chain || SupportedEvmCurrencyOptions[0].currencyAbbreviation,
  );
  const singleAddressCurrency =
    BitpaySupportedCoins[currencyAbbreviation?.toLowerCase() as string]
      ?.properties?.singleAddress;
  const nativeSegwitCurrency = IsSegwitCoin(_currencyAbbreviation);
  const [useNativeSegwit, setUseNativeSegwit] = useState(nativeSegwitCurrency);
  const [customAccount, setCustomAccount] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<number | undefined>();
  const [evmWallets, setEvmWallets] = useState<Wallet[] | undefined>();
  const [UIFormattedEvmWallets, setUIFormattedEvmWallets] = useState<
    WalletRowProps[] | undefined
  >();
  const [associatedWallet, setAssociatedWallet] = useState<
    WalletRowProps | undefined
  >();

  const DESCRIPTIONS: Record<string, string> = {
    eth: t('TokensOnEthereumNetworkDescription'),
    matic: t('TokensOnPolygonNetworkDescription'),
  };

  const [
    showAssociatedWalletSelectionDropdown,
    setShowAssociatedWalletSelectionDropdown,
  ] = useState<boolean | undefined>(false);

  const [associatedWalletModalVisible, setAssociatedWalletModalVisible] =
    useState(false);

  const [showChainSelectionDropdown] = useState<boolean | undefined>(!!_chain);

  const [chainModalVisible, setChainModalVisible] = useState(false);

  const withinReceiveSettings = isWithinReceiveSettings(navigation.getParent());

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => {
        return (
          <HeaderTitle>
            {isCustomToken
              ? t('Add Custom Token')
              : isToken
              ? t('Add Token', {
                  currencyAbbreviation: currencyAbbreviation?.toUpperCase(),
                })
              : t('AddWallet', {
                  currencyAbbreviation: currencyAbbreviation?.toUpperCase(),
                })}
          </HeaderTitle>
        );
      },
    });
  }, [navigation, t]);

  const addAssociatedWallet = async () => {
    try {
      const _associatedWallet = await _addWallet();
      const UIFormattedWallet = buildUIFormattedWallet(
        _associatedWallet,
        defaultAltCurrency.isoCode,
        rates,
        dispatch,
      );
      setAssociatedWallet(UIFormattedWallet);
      _setEvmWallets(chain);
      dispatch(dismissOnGoingProcessModal());
    } catch (err: any) {
      dispatch(LogActions.error(JSON.stringify(err)));
    }
  };

  const showMissingWalletMsg = async () => {
    await sleep(500);
    dispatch(
      showBottomNotificationModal({
        type: 'info',
        title: t('Missing wallet'),
        message: DESCRIPTIONS[chain],
        actions: [
          {
            primary: true,
            action: async () => {
              dispatch(dismissBottomNotificationModal());
              await sleep(500);
              addAssociatedWallet();
            },
            text: t('Create Wallet'),
          },
          {
            primary: false,
            action: () => {
              dispatch(dismissBottomNotificationModal());
            },
            text: t('Cancel'),
          },
        ],
        enableBackdropDismiss: true,
      }),
    );
  };

  const _setEvmWallets = (chain: string) => {
    if (!SUPPORTED_EVM_COINS.includes(chain)) {
      return;
    }
    if (isCustomToken) {
      setTokenAddress(undefined);
      setCurrencyName(undefined);
    }

    // Extract rootPaths from wallets
    const rootPaths = key.wallets.map(wallet => wallet.credentials.rootPath);
    // Display associated wallets under the following conditions:
    // 1. The wallet is part of a Layer 2 chain and no other wallet from the specified Layer 2 chain exists for the account.
    // 2. The wallet is an ERC20 token.
    const IS_ETH_CREATION = currencyAbbreviation === 'eth';
    const IS_TOKEN_CREATION = isToken;
    if (IS_ETH_CREATION) {
      return; // Stop execution if creating an ETH wallet since no associated wallets are needed
    }
    const isWalletSupported = (wallet: Wallet): boolean => {
      // Check if the wallet is an ERC token, tokens are not associated wallets
      const _isToken = IsERCToken(wallet.currencyAbbreviation, wallet.chain);
      if (_isToken) {
        return false;
      }

      // Ensure the wallet is on a supported EVM chain
      const isSupportedChain = SUPPORTED_EVM_COINS.includes(wallet.chain);
      if (!isSupportedChain) {
        return false;
      }

      // For token creation, wallet must be on the same chain
      const isSameChain = wallet.chain === chain;
      if (isSameChain && IS_TOKEN_CREATION) {
        return true;
      } else if (IS_TOKEN_CREATION) {
        return false;
      }
      // Ensure only one wallet from the specified Layer 2 chain exists for the account.
      const isNotAlreadyIncluded =
        rootPaths.filter(item => item === wallet.credentials.rootPath)
          .length === 1;

      return isNotAlreadyIncluded && !isSameChain;
    };

    const _evmWallets = key.wallets.filter(isWalletSupported);
    setEvmWallets(_evmWallets);

    // formatting for the bottom modal
    const _UIFormattedEvmWallets = _evmWallets?.map(wallet =>
      buildUIFormattedWallet(
        wallet,
        defaultAltCurrency.isoCode,
        rates,
        dispatch,
      ),
    );
    setUIFormattedEvmWallets(_UIFormattedEvmWallets);
    setAssociatedWallet(_UIFormattedEvmWallets[0]);

    if (!_evmWallets?.length && isToken) {
      showMissingWalletMsg();
    }
    setShowAssociatedWalletSelectionDropdown(_evmWallets.length > 1);
  };

  useEffect(() => {
    _setEvmWallets(chain);
  }, [chain]);

  const {
    control,
    handleSubmit,
    formState: {errors},
  } = useForm<{walletName: string}>({resolver: yupResolver(schema)});

  const _addWallet = async (
    _associatedWallet?: Wallet,
    walletName?: string,
  ): Promise<Wallet> => {
    return new Promise(async (resolve, reject) => {
      try {
        let password, _currencyAbbreviation: string | undefined;
        let account: number | undefined = selectedAccount;

        if (key.isPrivKeyEncrypted) {
          password = await dispatch(getDecryptPassword(key));
        }

        if (_associatedWallet) {
          _currencyAbbreviation = currencyAbbreviation!;
          if (!account) {
            account = getAccount(_associatedWallet.credentials.rootPath);
          }
          navigation.popToTop();
          if (withinReceiveSettings) {
            navigation.pop();
          }
        } else {
          _currencyAbbreviation = SupportedCurrencyOptions.find(
            currencyOpts =>
              currencyOpts.chain === chain &&
              currencyOpts.currencyAbbreviation === currencyAbbreviation,
          )?.currencyAbbreviation!;
        }

        dispatch(
          Analytics.track('Created Basic Wallet', {
            coin: _currencyAbbreviation.toLowerCase(),
            isErc20Token: !!isToken,
          }),
        );
        dispatch(startOnGoingProcessModal('ADDING_WALLET'));
        // adds wallet and binds to key obj - creates eth wallet if needed
        const wallet = await dispatch(
          addWallet({
            key,
            associatedWallet: _associatedWallet,
            currency: {
              chain,
              currencyAbbreviation: _currencyAbbreviation,
              isToken: isToken,
              tokenAddress: tokenAddress,
            },
            options: {
              password,
              network: isTestnet
                ? Network.testnet
                : isRegtest
                ? Network.regtest
                : network,
              useNativeSegwit,
              singleAddress,
              walletName: walletName === currencyName ? undefined : walletName,
              ...(account && {account}),
            },
          }),
        );

        if (!wallet.receiveAddress) {
          const walletAddress = (await dispatch<any>(
            createWalletAddress({wallet, newAddress: true}),
          )) as string;
          dispatch(LogActions.info(`new address generated: ${walletAddress}`));
        }

        try {
          // new wallet might have funds
          await dispatch(startGetRates({force: true}));
          await dispatch(startUpdateAllWalletStatusForKey({key, force: true}));
          await sleep(1000);
          dispatch(updatePortfolioBalance());
        } catch (error) {
          // ignore error
        }

        dispatch(dismissOnGoingProcessModal());
        resolve(wallet);
      } catch (err: any) {
        if (err.message === 'invalid password') {
          dispatch(showBottomNotificationModal(WrongPasswordError()));
        } else {
          dispatch(dismissOnGoingProcessModal());
          await sleep(500);
          showErrorModal(err.message);
          reject(err);
        }
      }
    });
  };

  const add = handleSubmit(async ({walletName}) => {
    try {
      const currency = currencyAbbreviation!.toLowerCase();
      let _associatedWallet: Wallet | undefined;
      if (associatedWallet) {
        _associatedWallet = evmWallets?.find(
          wallet => wallet.id === associatedWallet?.id,
        );

        if (_associatedWallet?.tokens && isToken) {
          // check tokens within associated wallet and see if token already exist
          const {tokens} = _associatedWallet;

          for (const token of tokens) {
            if (
              key?.wallets
                .find(wallet => wallet.id === token)
                ?.tokenAddress?.toLowerCase() === tokenAddress
            ) {
              dispatch(
                showBottomNotificationModal({
                  type: 'warning',
                  title: t('Currency already added'),
                  message: t(
                    'This currency is already associated with the selected wallet',
                  ),
                  enableBackdropDismiss: true,
                  actions: [
                    {
                      text: t('OK'),
                      action: () => {},
                      primary: true,
                    },
                  ],
                }),
              );
              return;
            }
          }
        }
      }

      const wallet = await _addWallet(_associatedWallet, walletName);

      if (!withinReceiveSettings) {
        navigation.dispatch(
          CommonActions.reset({
            index: 2,
            routes: [
              {
                name: RootStacks.TABS,
                params: {screen: getNavigationTabName()},
              },
              {
                name: WalletScreens.KEY_OVERVIEW,
                params: {
                  id: key.id,
                },
              },
              {
                name: WalletScreens.WALLET_DETAILS,
                params: {
                  walletId: wallet.id,
                  key,
                  skipInitializeHistory: false, // new wallet might have transactions
                },
              },
            ],
          }),
        );
      }
    } catch (err: any) {
      dispatch(LogActions.error(JSON.stringify(err)));
    }
  });

  const showErrorModal = (e: string) => {
    dispatch(
      showBottomNotificationModal({
        type: 'warning',
        title: t('Something went wrong'),
        message: e,
        enableBackdropDismiss: true,
        actions: [
          {
            text: t('OK'),
            action: () => {},
            primary: true,
          },
        ],
      }),
    );
  };

  const renderItem = useCallback(
    ({item}) => (
      <WalletRow
        id={item.id}
        hideBalance={hideAllBalances}
        onPress={() => {
          haptic('soft');
          setAssociatedWallet(item);
          if (isCustomToken && !!tokenAddress) {
            setTokenAddress(undefined);
          }
          setAssociatedWalletModalVisible(false);
        }}
        wallet={item}
      />
    ),
    [],
  );

  const renderChain = useCallback(
    ({item}) => (
      <CurrencySelectionRow
        currency={item}
        onToggle={chain => {
          haptic('soft');
          setChain(
            SupportedEvmCurrencyOptions.find(
              evmOpts => evmOpts.currencyAbbreviation === chain,
            )?.currencyAbbreviation!,
          );
          _setEvmWallets(chain);
          setChainModalVisible(false);
        }}
        key={item.id}
        hideCheckbox={true}
      />
    ),
    [],
  );

  const setTokenInfo = async (tokenAddress: string | undefined) => {
    try {
      if (!tokenAddress) {
        return;
      }

      setTokenAddress(tokenAddress);
      const fullWalletObj = key.wallets.find(
        ({id}) => id === associatedWallet?.id,
      )!;
      const {network, currencyAbbreviation, chain} = fullWalletObj;
      const opts = {
        tokenAddress,
        chain,
      };
      const addrData = GetCoinAndNetwork(tokenAddress, network, chain);
      const isValid =
        addrData?.coin.toLowerCase() && network === addrData?.network;

      if (!isValid) {
        return;
      }

      const tokenContractInfo = await getTokenContractInfo(fullWalletObj, opts);
      let customToken: Token = {
        name: tokenContractInfo.name,
        symbol: tokenContractInfo.symbol?.toLowerCase(),
        decimals: Number(tokenContractInfo.decimals),
        address: tokenAddress?.toLowerCase(),
      };
      setCurrencyAbbreviation(tokenContractInfo.symbol);
      setCurrencyName(tokenContractInfo.name);
      dispatch(addCustomTokenOption(customToken, chain));
      Keyboard.dismiss();
    } catch (error) {
      Keyboard.dismiss();
      setTokenAddress(undefined);
      await sleep(200);
      const err = t(
        'Could not find any ERC20 contract attached to the provided address. Recheck the contract address and network of the associated wallet.',
      );
      showErrorModal(err);
    }
  };

  return (
    <CreateWalletContainer>
      <ScrollView>
        {currencyAbbreviation && currencyName ? (
          <Controller
            control={control}
            render={({field: {onChange, onBlur, value}}) => (
              <BoxInput
                placeholder={`${currencyAbbreviation} Wallet`}
                label={'WALLET NAME'}
                onBlur={onBlur}
                onChangeText={(text: string) => onChange(text)}
                error={errors.walletName?.message}
                value={value}
              />
            )}
            name="walletName"
            defaultValue={`${currencyName}`}
          />
        ) : null}

        {!showChainSelectionDropdown && (
          <AssociatedWalletContainer>
            <Label>{t('CHAIN')}</Label>
            <AssociatedWallet
              activeOpacity={ActiveOpacity}
              onPress={() => {
                setChainModalVisible(true);
              }}>
              <Row
                style={{alignItems: 'center', justifyContent: 'space-between'}}>
                <Row style={{alignItems: 'center'}}>
                  <CurrencyImage img={CurrencyListIcons[chain]} size={30} />
                  <AssociateWalletName>
                    {
                      SupportedEvmCurrencyOptions.find(
                        evmOpts => evmOpts.currencyAbbreviation === chain,
                      )?.currencyName
                    }
                  </AssociateWalletName>
                </Row>
                <Icons.DownToggle />
              </Row>
            </AssociatedWallet>
          </AssociatedWalletContainer>
        )}

        {showAssociatedWalletSelectionDropdown && associatedWallet && (
          <>
            {!isToken ? (
              <RowChooseAccountContainer
                onPress={() => {
                  setCustomAccount(!customAccount);
                }}>
                <Column>
                  <Label>{t('CHOOSE ACCOUNT MANUALLY')}</Label>
                </Column>
                <CheckBoxContainer>
                  <Checkbox
                    checked={customAccount}
                    onPress={() => {
                      setCustomAccount(!customAccount);
                      setSelectedAccount(undefined);
                    }}
                  />
                </CheckBoxContainer>
              </RowChooseAccountContainer>
            ) : null}
            {!customAccount ? (
              <AssociatedWalletContainer>
                <Label>
                  {isToken
                    ? t('ASSOCIATED WALLET')
                    : t('USE THE SAME ADDRESS AS')}
                </Label>
                <AssociatedWallet
                  activeOpacity={ActiveOpacity}
                  onPress={() => {
                    setAssociatedWalletModalVisible(true);
                  }}>
                  <Row
                    style={{
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}>
                    <Row style={{alignItems: 'center'}}>
                      <CurrencyImage
                        img={CurrencyListIcons[associatedWallet.chain]}
                        size={30}
                      />
                      <AssociateWalletName>
                        {associatedWallet?.walletName ||
                          `${associatedWallet.currencyAbbreviation} Wallet`}
                      </AssociateWalletName>
                    </Row>
                    <Icons.DownToggle />
                  </Row>
                </AssociatedWallet>
              </AssociatedWalletContainer>
            ) : (
              <View style={{marginTop: 20}}>
                <BoxInput
                  placeholder={'0'}
                  label={t('ACCOUNT')}
                  onChangeText={(account: string) => {
                    setSelectedAccount(Number(account));
                  }}
                  value={tokenAddress}
                  keyboardType={'numeric'}
                />
              </View>
            )}
          </>
        )}

        {isCustomToken ? (
          <View style={{marginTop: 20}}>
            <BoxInput
              placeholder={t('Token Address')}
              disabled={!associatedWallet}
              label={t('CUSTOM TOKEN CONTRACT')}
              onChangeText={(text: string) => {
                setTokenInfo(text);
              }}
              error={errors.walletName?.message}
              value={tokenAddress}
            />
          </View>
        ) : null}

        {!isToken && (
          <WalletAdvancedOptionsContainer>
            <AdvancedOptionsButton
              onPress={() => {
                Haptic('impactLight');
                setShowOptions(!showOptions);
              }}>
              {showOptions ? (
                <>
                  <AdvancedOptionsButtonText>
                    {t('Hide Advanced Options')}
                  </AdvancedOptionsButtonText>
                  <ChevronUpSvg />
                </>
              ) : (
                <>
                  <AdvancedOptionsButtonText>
                    {t('Show Advanced Options')}
                  </AdvancedOptionsButtonText>
                  <ChevronDownSvg />
                </>
              )}
            </AdvancedOptionsButton>

            {showOptions && nativeSegwitCurrency && (
              <AdvancedOptions>
                <RowContainer
                  onPress={() => {
                    setUseNativeSegwit(!useNativeSegwit);
                  }}>
                  <Column>
                    <OptionTitle>Segwit</OptionTitle>
                  </Column>
                  <CheckBoxContainer>
                    <Checkbox
                      checked={useNativeSegwit}
                      onPress={() => {
                        setUseNativeSegwit(!useNativeSegwit);
                      }}
                    />
                  </CheckBoxContainer>
                </RowContainer>
              </AdvancedOptions>
            )}

            {showOptions && (
              <AdvancedOptions>
                <RowContainer
                  activeOpacity={1}
                  onPress={() => {
                    setIsTestnet(!isTestnet);
                    setIsRegtest(false);
                  }}
                  onLongPress={() => {
                    setIsTestnet(false);
                    setIsRegtest(!isRegtest);
                  }}>
                  <Column>
                    <OptionTitle>
                      {getProtocolName(
                        chain || '',
                        isRegtest ? 'regtest' : 'testnet',
                      )}
                    </OptionTitle>
                  </Column>
                  <CheckBoxContainer>
                    <Checkbox
                      checked={isTestnet || isRegtest}
                      onPress={() => {
                        setIsTestnet(!isTestnet);
                        setIsRegtest(false);
                      }}
                    />
                  </CheckBoxContainer>
                </RowContainer>
              </AdvancedOptions>
            )}

            {showOptions && !singleAddressCurrency && (
              <AdvancedOptions>
                <RowContainer
                  activeOpacity={1}
                  onPress={() => {
                    setSingleAddress(!singleAddress);
                  }}>
                  <Column>
                    <OptionTitle>Single Address</OptionTitle>
                  </Column>
                  <CheckBoxContainer>
                    <Checkbox
                      checked={singleAddress}
                      onPress={() => {
                        setSingleAddress(!singleAddress);
                      }}
                    />
                  </CheckBoxContainer>
                </RowContainer>

                {singleAddress && (
                  <>
                    <Info style={{marginHorizontal: 10}}>
                      <InfoTriangle />

                      <InfoHeader>
                        <InfoImageContainer infoMargin={'0 8px 0 0'}>
                          <InfoSvg />
                        </InfoImageContainer>

                        <InfoTitle>Single Address Wallet</InfoTitle>
                      </InfoHeader>
                      <InfoDescription>
                        The single address feature will force the wallet to only
                        use one address rather than generating new addresses.
                      </InfoDescription>

                      <VerticalPadding>
                        <TouchableOpacity
                          onPress={() => {
                            Haptic('impactLight');
                            dispatch(
                              openUrlWithInAppBrowser(URL.HELP_SINGLE_ADDRESS),
                            );
                          }}>
                          <Link>Learn More</Link>
                        </TouchableOpacity>
                      </VerticalPadding>
                    </Info>
                  </>
                )}
              </AdvancedOptions>
            )}
          </WalletAdvancedOptionsContainer>
        )}

        <SheetModal
          isVisible={associatedWalletModalVisible}
          onBackdropPress={() => setAssociatedWalletModalVisible(false)}>
          <AssociatedWalletSelectionModalContainer>
            <TextAlign align={'center'}>
              <H4>{t('Select a Wallet')}</H4>
            </TextAlign>
            <FlatList
              contentContainerStyle={{paddingTop: 20, paddingBottom: 20}}
              data={UIFormattedEvmWallets}
              keyExtractor={keyExtractor}
              renderItem={renderItem}
            />
          </AssociatedWalletSelectionModalContainer>
        </SheetModal>

        <SheetModal
          isVisible={chainModalVisible}
          onBackdropPress={() => setChainModalVisible(false)}>
          <AssociatedWalletSelectionModalContainer>
            <TextAlign align={'center'}>
              <H4>{t('Select a Chain')}</H4>
            </TextAlign>
            <FlatList
              contentContainerStyle={{paddingTop: 20, paddingBottom: 20}}
              data={SupportedEvmCurrencyOptions}
              keyExtractor={keyExtractor}
              renderItem={renderChain}
            />
          </AssociatedWalletSelectionModalContainer>
        </SheetModal>

        <ButtonContainer>
          <Button
            disabled={
              !currencyAbbreviation ||
              !currencyName ||
              (!associatedWallet && isToken)
            }
            onPress={add}
            buttonStyle={'primary'}>
            {t('Add ') +
              (isCustomToken
                ? t('Custom Token')
                : isToken
                ? t('Token')
                : t('Wallet'))}
          </Button>
        </ButtonContainer>
      </ScrollView>
    </CreateWalletContainer>
  );
};

export default AddWallet;
