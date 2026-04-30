export const APP_NAVIGATION_GUARD_EVENT = "friogestion:before-app-navigation";

export const requestAppNavigation = () => {
  if (typeof window === "undefined") return true;
  return window.dispatchEvent(
    new Event(APP_NAVIGATION_GUARD_EVENT, { cancelable: true }),
  );
};
