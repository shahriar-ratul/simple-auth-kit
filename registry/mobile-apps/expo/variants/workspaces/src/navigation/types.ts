export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
  TwoFactor: undefined;
};

/**
 * Shown when the user is authenticated but no workspace is active — either they have none yet,
 * or the persisted one is no longer theirs. Its own stack rather than a screen in the app stack
 * so there is nothing behind it to back out into.
 */
export type WorkspaceGateStackParamList = {
  ChooseWorkspace: undefined;
};

export type AppStackParamList = {
  Home: undefined;
  Sessions: undefined;
  SwitchWorkspace: undefined;
};
