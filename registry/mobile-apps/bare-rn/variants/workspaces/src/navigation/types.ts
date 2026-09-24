export type RootStackParamList = {
  // Unauthenticated stack
  Login: undefined;
  Signup: undefined;
  TwoFactor: { challengeToken: string };
  // Authenticated, no active workspace — the gate shown before the app stack is reachable.
  ChooseWorkspace: undefined;
  // Authenticated stack
  Home: undefined;
  Sessions: undefined;
  EditProfile: undefined;
  ChangePassword: undefined;
  TwoFactorSettings: undefined;
  SwitchWorkspace: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
