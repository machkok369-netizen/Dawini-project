export const routeAuthenticatedUser = (navigation, uid, userData) => {
  let nextScreen;
  let nextScreenParams;

  if (userData.role === 'doctor') {
    if (!userData.profileCompleted) {
      nextScreen = 'EditProfile';
      nextScreenParams = { isNewDoctor: true };
    } else {
      nextScreen = 'DoctorDashboard';
    }
  } else if (!userData.patientProfileCompleted) {
    nextScreen = 'PatientOnboarding';
  } else {
    nextScreen = 'PatientMap';
  }

  if (!userData.termsAccepted) {
    navigation.replace('TermsAcceptance', {
      uid,
      nextScreen,
      nextScreenParams,
    });
    return;
  }

  navigation.replace(nextScreen, nextScreenParams || {});
};
