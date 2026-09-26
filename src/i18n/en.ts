// English strings (CLAUDE.md rule 10). M12a moves these to i18next JSON with ta/kn/hi.
export const en = {
  common: {
    appName: 'Namma Lorry',
    signOut: 'Sign out',
    retry: 'Try again',
    back: 'Back',
  },
  splash: {
    tagline: 'Your work, verified.',
    restoring: 'Restoring your trip…',
    error: "Couldn't load your account. Check your connection.",
  },
  signIn: {
    title: 'Sign in with your mobile number',
    subtitle: "We'll send a 6-digit code by SMS.",
    phoneLabel: 'Mobile number',
    clear: 'Clear number',
    sendOtp: 'Send OTP',
    changeLanguage: 'Change language: English',
    languageSoon: 'Tamil, Kannada and Hindi are coming soon.',
    newDriver: 'New driver? Contact Namma Lorry to get registered.',
    errors: {
      invalid_phone: 'Enter a valid 10-digit mobile number.',
      unregistered: "This number isn't registered with Namma Lorry. Contact Namma Lorry to register.",
      rate_limited: 'Too many attempts. Please wait a few minutes and try again.',
      network: "You're offline. Check your connection and try again.",
      sms_failed: "We couldn't send the SMS. Please try again.",
      unknown: 'Something went wrong. Please try again.',
    },
  },
  verify: {
    title: 'Enter the code',
    sentTo: (masked: string) => `Sent to ${masked}`,
    edit: 'Edit',
    codeLabel: '6-digit code',
    resendIn: (mmss: string) => `Resend code in ${mmss}`,
    resend: 'Resend code',
    resent: 'A new code has been sent.',
    submit: 'Verify & continue',
    errors: {
      wrong_code: 'Wrong code. Check the SMS and try again.',
      expired: 'This code has expired. Tap "Resend code" for a new one.',
      rate_limited: 'Too many attempts. Please wait a few minutes and try again.',
      network: "You're offline. Check your connection and try again.",
      unknown: 'Something went wrong. Please try again.',
    },
  },
  notice: {
    'driver-web': {
      title: 'Trips run on the mobile app',
      body: 'To start and record trips, install Namma Lorry on your Android or iPhone. This web page is for the operations team.',
      playStore: 'Get it on Google Play',
      appStore: 'Download on the App Store',
    },
    'coming-soon': {
      title: 'Coming soon for owners and shippers',
      body: 'Live tracking for your vehicles and loads is coming in the next release.',
    },
    deactivated: {
      title: 'Your account is deactivated',
      body: 'Contact Namma Lorry if you think this is a mistake.',
    },
    'no-profile': {
      title: "This number isn't registered",
      body: 'Contact Namma Lorry to register.',
    },
    signOutBlocked: 'You have a trip in progress. End the trip before signing out.',
  },
} as const;

export const t = en;
