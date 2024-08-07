import React, {useLayoutEffect} from 'react';
import styled from 'styled-components/native';
import {H3, Paragraph, TextAlign} from '../../../components/styled/Text';
import {
  CtaContainer,
  HeaderRightContainer,
  ImageContainer,
  TextContainer,
  TitleContainer,
} from '../../../components/styled/Containers';
import Button from '../../../components/button/Button';
import {useAndroidBackHandler} from 'react-navigation-backhandler';
import {useDispatch, useSelector} from 'react-redux';
import {OnboardingImage} from '../../onboarding/components/Containers';
import haptic from '../../../components/haptic-feedback/haptic';
import {showBottomNotificationModal} from '../../../store/app/app.actions';
import {WalletGroupParamList, WalletScreens} from '../WalletGroup';
import {Key, Wallet} from '../../../store/wallet/wallet.models';
import {NavigationProp, useNavigation} from '@react-navigation/native';
import {StackActions} from '@react-navigation/native';
import {RootState} from '../../../store';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useThemeType} from '../../../utils/hooks/useThemeType';
import {useTranslation} from 'react-i18next';

const BackupImage = {
  light: (
    <OnboardingImage
      style={{width: 217, height: 195}}
      source={require('../../../../assets/img/onboarding/light/backup.png')}
    />
  ),
  dark: (
    <OnboardingImage
      style={{width: 217, height: 165}}
      source={require('../../../../assets/img/onboarding/dark/backup.png')}
    />
  ),
};

type BackupScreenProps = NativeStackScreenProps<
  WalletGroupParamList,
  WalletScreens.BACKUP_KEY
>;

export type BackupParamList = {
  context: 'onboarding' | 'createNewKey' | 'createNewMultisigKey';
  key: Key;
};

const BackupContainer = styled.SafeAreaView`
  flex: 1;
  align-items: center;
`;

export const backupRedirect = ({
  context,
  navigation,
  walletTermsAccepted,
  key,
}: {
  context: string | undefined;
  navigation: NavigationProp<any>;
  walletTermsAccepted: boolean;
  key?: Key;
}) => {
  if (context === 'onboarding') {
    navigation.navigate('TermsOfUse');
  } else if (context === 'keySettings') {
    navigation.navigate('KeySettings', {key});
  } else if (context === 'settings') {
    navigation.navigate('Tabs', {screen: 'Settings', params: {key}});
  } else if (!key?.backupComplete) {
    navigation.navigate('Tabs', {screen: 'Home'});
  } else if (!walletTermsAccepted) {
    navigation.navigate('TermsOfUse', {key});
  } else if (context === 'createNewMultisigKey') {
    navigation.dispatch(StackActions.popToTop());
    navigation.dispatch(
      StackActions.push('KeyOverview', {id: key.id, context}),
    );
  } else if (context === 'swapCrypto' || context === 'swapTo') {
    navigation.navigate('SwapCryptoRoot');
  } else if (context === 'buyCrypto') {
    navigation.navigate('BuyCryptoRoot');
  } else {
    navigation.dispatch(StackActions.popToTop());
    navigation.dispatch(StackActions.push('KeyOverview', {id: key.id}));
  }
};

const BackupScreen = ({route}: BackupScreenProps) => {
  const {t} = useTranslation();
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const themeType = useThemeType();

  const walletTermsAccepted = useSelector(
    ({WALLET}: RootState) => WALLET.walletTermsAccepted,
  );

  const {context, key} = route.params;

  const gotoBackup = () => {
    const {id, mnemonic} = key.properties!;
    navigation.navigate('RecoveryPhrase', {
      keyId: id,
      words: mnemonic.trim().split(' '),
      walletTermsAccepted,
      ...route.params,
    });
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      gestureEnabled: false,
      headerLeft: () => null,
      headerRight: () => (
        <HeaderRightContainer>
          <Button
            accessibilityLabel="skip-button"
            buttonType={'pill'}
            onPress={async () => {
              haptic('impactLight');
              dispatch(
                showBottomNotificationModal({
                  type: 'warning',
                  title: t('Are you sure?'),
                  message: t(
                    'You will not be able to add funds to your wallet until you backup your recovery phrase.',
                  ),
                  enableBackdropDismiss: true,
                  actions: [
                    {
                      text: t('BACKUP YOUR KEY'),
                      action: gotoBackup,
                      primary: true,
                    },
                    {
                      text: t('LATER'),
                      action: () =>
                        backupRedirect({
                          context,
                          navigation,
                          walletTermsAccepted,
                          key,
                        }),
                    },
                  ],
                }),
              );
            }}>
            {t('Skip')}
          </Button>
        </HeaderRightContainer>
      ),
    });
  }, [navigation, t]);

  useAndroidBackHandler(() => true);

  return (
    <BackupContainer accessibilityLabel="backup-container">
      <ImageContainer>{BackupImage[themeType]}</ImageContainer>
      <TitleContainer>
        <TextAlign align={'center'}>
          <H3>{t('Would you like to backup your key?')}</H3>
        </TextAlign>
      </TitleContainer>
      <TextContainer>
        <TextAlign align={'center'}>
          <Paragraph>
            {t(
              "If you delete the BitPay app or lose your device, you'll need your recovery phrase regain access to your funds.",
            )}
          </Paragraph>
        </TextAlign>
      </TextContainer>
      <CtaContainer>
        <Button
          accessibilityLabel="go-to-backup-button"
          buttonStyle={'primary'}
          onPress={gotoBackup}>
          {t('Backup your Recovery Phrase')}
        </Button>
      </CtaContainer>
    </BackupContainer>
  );
};

export default BackupScreen;
