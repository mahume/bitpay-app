import {BitPayIdActionTypes, BitPayIdActionType} from './bitpay-id.types';
import {Session, User} from './bitpay-id.models';
import {Network} from '../../constants';

export const successFetchSession = (session: Session): BitPayIdActionType => ({
  type: BitPayIdActionTypes.SUCCESS_FETCH_SESSION,
  payload: {session},
});

export const failedFetchSession = (): BitPayIdActionType => ({
  type: BitPayIdActionTypes.FAILED_FETCH_SESSION,
});

export const successLogin = (
  network: Network,
  user: User,
  session: Session,
): BitPayIdActionType => ({
  type: BitPayIdActionTypes.SUCCESS_LOGIN,
  payload: {network, user, session},
});

export const failedLogin = (): BitPayIdActionType => ({
  type: BitPayIdActionTypes.FAILED_LOGIN,
});

export const resetLogin = (): BitPayIdActionType => ({
  type: BitPayIdActionTypes.RESET_LOGIN,
});
