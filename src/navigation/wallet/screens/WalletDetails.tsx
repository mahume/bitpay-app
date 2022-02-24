import {useNavigation, useTheme} from '@react-navigation/native';
import {StackScreenProps} from '@react-navigation/stack';
import React, {useCallback, useEffect, useLayoutEffect, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {RefreshControl, SectionList, Share, View} from 'react-native';
import {useDispatch} from 'react-redux';
import styled from 'styled-components/native';
import Settings from '../../../components/settings/Settings';
import {
  Balance,
  BaseText,
  H5,
  HeaderTitle,
} from '../../../components/styled/Text';
import {Network} from '../../../constants';
import {SUPPORTED_CURRENCIES} from '../../../constants/currencies';
import {showBottomNotificationModal} from '../../../store/app/app.actions';
import {startUpdateWalletBalance} from '../../../store/wallet/effects/balance/balance';
import {findWalletById} from '../../../store/wallet/utils/wallet';
import {updatePortfolioBalance} from '../../../store/wallet/wallet.actions';
import {Key, Wallet} from '../../../store/wallet/wallet.models';
import {LightBlack, SlateDark, White} from '../../../styles/colors';
import {sleep} from '../../../utils/helper-methods';
import LinkingButtons from '../../tabs/home/components/LinkingButtons';
import {BalanceUpdateError} from '../components/ErrorMessages';
import OptionsSheet, {Option} from '../components/OptionsSheet';
import ReceiveAddress from '../components/ReceiveAddress';
import Icons from '../components/WalletIcons';
import {WalletStackParamList} from '../WalletStack';
import {buildUIFormattedWallet} from './KeyOverview';
import {useAppSelector} from '../../../utils/hooks';
import {createWalletAddress} from '../../../store/wallet/effects/address/address';
import {
  GetTransactionHistory,
  GroupTransactionHistory,
} from '../../../store/wallet/effects/transactions/transactions';
import {ScreenGutter} from '../../../components/styled/Containers';
import TransactionRow, {
  TRANSACTION_ROW_HEIGHT,
} from '../../../components/list/TransactionRow';
import GhostSvg from '../../../../assets/img/ghost-straight-face.svg';
import WalletTransactionSkeletonRow from '../../../components/list/WalletTransactionSkeletonRow';

const HISTORY_SHOW_LIMIT = 15;

type WalletDetailsScreenProps = StackScreenProps<
  WalletStackParamList,
  'WalletDetails'
>;

const WalletDetailsContainer = styled.View`
  flex: 1;
  padding-top: 10px;
`;

const Row = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: flex-end;
`;

const BalanceContainer = styled.View`
  margin-top: 20px;
  padding: 0 15px 10px;
  flex-direction: column;
`;

const Chain = styled(BaseText)`
  font-size: 16px;
  font-style: normal;
  letter-spacing: 0;
  line-height: 40px;
  color: ${({theme: {dark}}) => (dark ? White : LightBlack)};
`;

const Type = styled(BaseText)`
  font-size: 12px;
  color: ${({theme: {dark}}) => (dark ? White : SlateDark)};
  border: 1px solid ${({theme: {dark}}) => (dark ? '#252525' : '#E1E4E7')};
  padding: 2px 4px;
  border-radius: 3px;
  margin-left: auto;
`;

const TransactionSectionHeader = styled(H5)`
  padding: ${ScreenGutter};
  background-color: ${({theme: {dark}}) => (dark ? LightBlack : '#F5F6F7')};
`;

const BorderBottom = styled.View`
  border-bottom-width: 1px;
  border-bottom-color: ${({theme: {dark}}) => (dark ? LightBlack : '#EBEDF8')};
`;

const SkeletonContainer = styled.View`
  padding: 0 ${ScreenGutter};
  margin-bottom: 20px;
  height: ${TRANSACTION_ROW_HEIGHT}px;
`;

const EmptyListContainer = styled.View`
  justify-content: space-between;
  align-items: center;
  margin-top: 50px;
`;

const getWalletType = (key: Key, wallet: Wallet) => {
  const {
    credentials: {token, walletId},
  } = wallet;
  if (token) {
    const linkedWallet = key.wallets.find(({tokens}) =>
      tokens?.includes(walletId),
    );
    const walletName =
      linkedWallet?.walletName || linkedWallet?.credentials.walletName;
    return `Linked to ${walletName}`;
  }
  return;
};

const WalletDetails: React.FC<WalletDetailsScreenProps> = ({route}) => {
  const navigation = useNavigation();
  const dispatch = useDispatch();
  const theme = useTheme();
  const {t} = useTranslation();
  const [showWalletOptions, setShowWalletOptions] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const {walletId, key} = route.params;
  const wallets = useAppSelector(({WALLET}) => WALLET.keys[key.id].wallets);
  const fullWalletObj = findWalletById(wallets, walletId) as Wallet;
  const uiFormattedWallet = buildUIFormattedWallet(fullWalletObj);
  const [showReceiveAddressBottomModal, setShowReceiveAddressBottomModal] =
    useState(false);
  const [loadReceiveAddressModal, setLoadReceiveAddressModal] = useState(false);
  const walletType = getWalletType(key, fullWalletObj);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <HeaderTitle>{uiFormattedWallet.walletName}</HeaderTitle>
      ),
      headerRight: () => (
        <Settings
          onPress={() => {
            setShowWalletOptions(true);
          }}
        />
      ),
    });
  }, [navigation, uiFormattedWallet]);

  useEffect(() => {
    setRefreshing(!!fullWalletObj.isRefreshing);
  }, [fullWalletObj.isRefreshing]);

  const ShareAddress = async () => {
    try {
      await sleep(1000);
      const address = (await dispatch<any>(
        createWalletAddress({wallet: fullWalletObj, newAddress: false}),
      )) as string;

      await Share.share({
        message: address,
      });
    } catch (e) {}
  };

  const assetOptions: Array<Option> = [
    {
      img: <Icons.RequestAmount />,
      title: 'Request a specific amount',
      description:
        'This will generate an invoice, which the person you send it to can pay using any wallet.',
      onPress: () => {
        navigation.navigate('Wallet', {
          screen: 'RequestSpecificAmount',
          params: {wallet: fullWalletObj},
        });
      },
    },
    {
      img: <Icons.ShareAddress />,
      title: 'Share Address',
      description:
        'Share your wallet address to someone in your contacts so they can send you funds.',
      onPress: ShareAddress,
    },
    {
      img: <Icons.Settings />,
      title: 'Wallet Settings',
      description: 'View all the ways to manage and configure your wallet.',
      onPress: () =>
        navigation.navigate('Wallet', {
          screen: 'WalletSettings',
          params: {
            key,
            walletId,
          },
        }),
    },
  ];

  const showReceiveAddress = () => {
    setShowReceiveAddressBottomModal(true);
    setLoadReceiveAddressModal(true);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await sleep(1000);

    try {
      await Promise.all([
        await dispatch(startUpdateWalletBalance({key, wallet: fullWalletObj})),
        await loadHistory(true),
        sleep(1000),
      ]);
      dispatch(updatePortfolioBalance());
    } catch (err) {
      dispatch(showBottomNotificationModal(BalanceUpdateError));
    }
    setRefreshing(false);
  };

  const {
    cryptoBalance,
    fiatBalance,
    currencyName,
    currencyAbbreviation,
    network,
  } = uiFormattedWallet;

  const showFiatBalance =
    SUPPORTED_CURRENCIES.includes(currencyAbbreviation.toLowerCase()) &&
    network !== Network.testnet;

  const [history, setHistory] = useState<any[]>([]);
  const [groupedHistory, setGroupedHistory] = useState<
    {title: string; data: any[]}[]
  >([]);
  const [loadMore, setLoadMore] = useState(true);
  const [isLoading, setIsLoading] = useState<boolean>();
  const [errorLoadingTxs, setErrorLoadingTxs] = useState<boolean>();

  const loadHistory = async (refresh?: boolean) => {
    if (!loadMore && !refresh) {
      return;
    }
    try {
      setIsLoading(!refresh);
      setErrorLoadingTxs(false);
      let {transactions: _history, loadMore: _loadMore} =
        await GetTransactionHistory({
          wallet: fullWalletObj,
          transactionsHistory: refresh ? [] : history,
          limit: HISTORY_SHOW_LIMIT,
        });

      if (_history?.length) {
        setHistory(_history);
        const grouped = GroupTransactionHistory(_history);
        setGroupedHistory(grouped);
      }
      setIsLoading(false);
      setLoadMore(_loadMore);
    } catch (e) {
      setLoadMore(false);
      setIsLoading(false);
      setErrorLoadingTxs(true);

      console.log('Transaction Update: ', e);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const listFooterComponent = () => {
    return (
      <>
        {!groupedHistory?.length ? null : (
          <View style={{marginBottom: 20}}>
            <BorderBottom />
          </View>
        )}
        {isLoading ? (
          <SkeletonContainer>
            <WalletTransactionSkeletonRow />
          </SkeletonContainer>
        ) : null}
      </>
    );
  };

  const listEmptyComponent = () => {
    return (
      <>
        {!isLoading && !errorLoadingTxs && (
          <EmptyListContainer>
            <H5>It's a ghost town in here</H5>
            <GhostSvg style={{marginTop: 20}} />
          </EmptyListContainer>
        )}

        {!isLoading && errorLoadingTxs && (
          <EmptyListContainer>
            <H5>Could not update transaction history</H5>
            <GhostSvg style={{marginTop: 20}} />
          </EmptyListContainer>
        )}
      </>
    );
  };

  const renderItem = useCallback(
    ({item}) => (
      <TransactionRow
        icon={item.uiIcon}
        description={item.uiDescription}
        time={item.uiTime}
        value={item.uiValue}
        onPressTransaction={() => {}}
      />
    ),
    [],
  );

  const keyExtractor = useCallback(item => item.txid, []);

  const getItemLayout = useCallback(
    (data, index) => ({
      length: TRANSACTION_ROW_HEIGHT,
      offset: TRANSACTION_ROW_HEIGHT * index,
      index,
    }),
    [],
  );
  return (
    <WalletDetailsContainer>
      <SectionList
        refreshControl={
          <RefreshControl
            tintColor={theme.dark ? White : SlateDark}
            refreshing={refreshing}
            onRefresh={onRefresh}
          />
        }
        ListHeaderComponent={() => {
          return (
            <>
              <BalanceContainer>
                <Row>
                  <Balance>
                    {cryptoBalance} {currencyAbbreviation}
                  </Balance>
                  <Chain>{currencyAbbreviation}</Chain>
                </Row>
                <Row>
                  {showFiatBalance && <H5>{fiatBalance}</H5>}
                  {walletType && <Type>{walletType}</Type>}
                </Row>
              </BalanceContainer>

              {fullWalletObj ? (
                <LinkingButtons
                  receive={{cta: () => showReceiveAddress()}}
                  send={{
                    hide: __DEV__ ? false : !fullWalletObj.balance.fiat,
                    cta: () =>
                      navigation.navigate('Wallet', {
                        screen: 'SendTo',
                        params: {wallet: fullWalletObj},
                      }),
                  }}
                />
              ) : null}
            </>
          );
        }}
        sections={groupedHistory}
        stickyHeaderIndices={[groupedHistory?.length]}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        renderSectionHeader={({section: {title}}) => (
          <TransactionSectionHeader>{title}</TransactionSectionHeader>
        )}
        ItemSeparatorComponent={() => <BorderBottom />}
        ListFooterComponent={listFooterComponent}
        onEndReached={() => loadHistory()}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={listEmptyComponent}
        maxToRenderPerBatch={15}
        getItemLayout={getItemLayout}
      />

      <OptionsSheet
        isVisible={showWalletOptions}
        closeModal={() => setShowWalletOptions(false)}
        title={t('ReceiveCurrency', {currency: currencyName})}
        options={assetOptions}
      />

      {fullWalletObj && loadReceiveAddressModal ? (
        <ReceiveAddress
          isVisible={showReceiveAddressBottomModal}
          closeModal={() => setShowReceiveAddressBottomModal(false)}
          wallet={fullWalletObj}
        />
      ) : null}
    </WalletDetailsContainer>
  );
};

export default WalletDetails;
