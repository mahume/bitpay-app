import React, {useEffect, useState} from 'react';
import styled from 'styled-components/native';
import {BaseText, H5, HeaderTitle} from '../../../components/styled/Text';
import {useNavigation, useRoute} from '@react-navigation/native';
import {RouteProp} from '@react-navigation/core';
import {WalletStackParamList} from '../WalletStack';
import AssetRow, {AssetRowProps} from '../../../components/list/AssetRow';
import {FlatList} from 'react-native';
import {Asset} from '../../../store/wallet/wallet.models';
import {AssetListIcons} from '../../../constants/AssetListIcons';
import AddAsset from '../../../../assets/img/add-asset.svg';
import {useSelector} from 'react-redux';
import {RootState} from '../../../store';
import {formatFiatBalance} from '../../../utils/helper-methods';
import WalletOptionsBottomPopupModal from '../components/WalletOptionsBottomPopupModal';
import Settings from '../../../components/settings/Settings';

const OverviewContainer = styled.View`
  flex: 1;
`;

const BalanceContainer = styled.View`
  height: 10%;
  margin-top: 20px;
  padding: 10px;
`;

const Balance = styled(BaseText)`
  font-size: 36px;
  font-style: normal;
  font-weight: 700;
  line-height: 53px;
  letter-spacing: 0;
`;

const AssetListHeader = styled.View`
  padding: 10px;
  margin-top: 10px;
`;

const AssetListFooter = styled.TouchableOpacity`
  padding: 10px 10px 100px 10px;
  margin-top: 15px;
  flex-direction: row;
  align-items: center;
`;

const AssetListFooterText = styled(BaseText)`
  font-size: 16px;
  font-style: normal;
  font-weight: 400;
  letter-spacing: 0;
  margin-left: 10px;
`;

const buildAssetList = (assets: Asset[]) => {
  const assetList = [] as Array<AssetRowProps>;
  assets
    .filter(asset => !asset.token)
    .forEach(({coin, walletName, walletId, balance = 0, tokens}) => {
      assetList.push({
        id: walletId,
        img: () => AssetListIcons[coin].square,
        assetName: walletName,
        assetAbbreviation: coin.toUpperCase(),
        cryptoBalance: balance,
        fiatBalance: formatFiatBalance(balance),
      });

      if (tokens) {
        tokens.forEach(({name, symbol, balance = 0}) => {
          assetList.push({
            id: `${walletId}-${symbol}`,
            img: () => AssetListIcons[symbol.toLowerCase()].round,
            assetName: name,
            assetAbbreviation: symbol.toUpperCase(),
            cryptoBalance: balance,
            fiatBalance: formatFiatBalance(balance),
            isToken: true,
          });
        });
      }
    });

  return assetList;
};

const WalletOverview = () => {
  const route = useRoute<RouteProp<WalletStackParamList, 'WalletOverview'>>();
  const navigation = useNavigation();
  const [showWalletOptions, setShowWalletOptions] = useState(false);

  useEffect(() => {
    navigation.setOptions({
      headerTitle: () => <HeaderTitle>Wallet1</HeaderTitle>,
      headerRight: () => (
        <Settings
          onPress={() => {
            setShowWalletOptions(true);
          }}
        />
      ),
    });
  }, [navigation]);
  const {
    wallet: {id},
  } = route.params;
  const wallet = useSelector(({WALLET}: RootState) => WALLET.wallets[id]);
  const assetList = buildAssetList(wallet.assets);

  return (
    <OverviewContainer>
      <BalanceContainer>
        <Balance>${wallet.totalBalance?.toFixed(2)} USD</Balance>
      </BalanceContainer>
      <FlatList
        ListHeaderComponent={() => {
          return (
            <AssetListHeader>
              <H5>My Assets</H5>
            </AssetListHeader>
          );
        }}
        ListFooterComponent={() => {
          return (
            <AssetListFooter activeOpacity={0.75} onPress={() => null}>
              <AddAsset />
              <AssetListFooterText>Add Asset</AssetListFooterText>
            </AssetListFooter>
          );
        }}
        data={assetList}
        renderItem={({item}) => {
          return <AssetRow id={item.id} asset={item} />;
        }}
      />
      <WalletOptionsBottomPopupModal
        isVisible={showWalletOptions}
        wallet={wallet}
        closeModal={() => setShowWalletOptions(false)}
      />
    </OverviewContainer>
  );
};

export default WalletOverview;