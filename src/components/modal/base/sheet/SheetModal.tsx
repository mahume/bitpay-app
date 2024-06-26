import React, {useEffect, useState} from 'react';
import {BlurContainer} from '../../../blur/Blur';
import {SheetParams} from '../../../styled/Containers';
import BaseModal from '../BaseModal';
import {AppState, AppStateStatus} from 'react-native';

interface Props extends SheetParams {
  isVisible: boolean;
  onBackdropPress: (props?: any) => void;
  onModalHide?: () => void;
  children?: any;
}

type SheetModalProps = React.PropsWithChildren<Props>;

const SheetModal: React.FC<SheetModalProps> = ({
  children,
  isVisible,
  onBackdropPress,
  onModalHide,
  placement,
}) => {
  const [isModalVisible, setModalVisible] = useState(isVisible);
  useEffect(() => {
    function onAppStateChange(status: AppStateStatus) {
      if (isVisible && status === 'background') {
        setModalVisible(false);
        onBackdropPress();
      }
    }
    setModalVisible(isVisible);

    const subscriptionAppStateChange = AppState.addEventListener(
      'change',
      onAppStateChange,
    );

    return () => subscriptionAppStateChange.remove();
  }, [isVisible]);
  return (
    <BaseModal
      id={'sheetModal'}
      isVisible={isModalVisible}
      backdropOpacity={0.4}
      backdropTransitionOutTiming={0}
      hideModalContentWhileAnimating={true}
      useNativeDriverForBackdrop={true}
      useNativeDriver={true}
      testID="modalBackdrop"
      onBackdropPress={onBackdropPress}
      animationIn={placement === 'top' ? 'slideInDown' : 'slideInUp'}
      animationOut={placement === 'top' ? 'slideOutUp' : 'slideOutDown'}
      onModalHide={onModalHide}
      // swipeDirection={'down'}
      // onSwipeComplete={hideModal}
      style={{
        position: 'relative',
        justifyContent: placement === 'top' ? 'flex-start' : 'flex-end',
        margin: 0,
      }}>
      <>
        {children}
        <BlurContainer />
      </>
    </BaseModal>
  );
};

export default SheetModal;
