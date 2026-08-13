export type RootStackParamList = {
  // Unauthenticated stack
  Login: undefined;
  Signup: undefined;
  TwoFactor: { challengeToken: string };
  // Authenticated stack
  Home: undefined;
  Sessions: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
