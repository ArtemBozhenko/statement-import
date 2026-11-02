// Dynamic config over app.json. Development builds expose the app's Documents folder in the Files app
// so fixtures can be dropped in by hand; release builds must not, because the operation record
// (file name, merchants, amounts) lives there. Enable with EXPO_FILE_SHARING=1 at prebuild time.
module.exports = ({ config }) => {
  if (process.env.EXPO_FILE_SHARING !== '1') return config;
  return {
    ...config,
    ios: {
      ...config.ios,
      infoPlist: { ...config.ios?.infoPlist, UIFileSharingEnabled: true, LSSupportsOpeningDocumentsInPlace: true },
    },
  };
};
