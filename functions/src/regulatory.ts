export type ServiceType = "PASSENGER" | "DELIVERY";

export interface RegulatoryProfile {
  countryCode: string;
  regionCode?: string;
  cityCode?: string;
  passenger: {
    requiresValidLicense: boolean;
    requiresEAR: boolean;
    requiresVehicleDocument: boolean;
    requiresInsurance: boolean;
    requiresLocalAuthorization: boolean;
  };
  delivery: {
    requiresValidLicense: boolean;
    requiresVehicleDocument: boolean;
    requiresInsurance: boolean;
    requiresLocalAuthorization: boolean;
  };
}

export const DEFAULT_BRAZIL_PROFILE: RegulatoryProfile = {
  countryCode: "BR",
  passenger: {
    requiresValidLicense: true,
    requiresEAR: true,
    requiresVehicleDocument: true,
    requiresInsurance: true,
    requiresLocalAuthorization: true
  },
  delivery: {
    requiresValidLicense: true,
    requiresVehicleDocument: true,
    requiresInsurance: true,
    requiresLocalAuthorization: false
  }
};

export function passengerEligible(profile: RegulatoryProfile, compliance: Record<string, unknown>): boolean {
  return profile.passenger.requiresValidLicense === false || compliance.licenseValid === true
    ? (!profile.passenger.requiresEAR || compliance.earVerified === true)
      && (!profile.passenger.requiresVehicleDocument || compliance.vehicleDocumentVerified === true)
      && (!profile.passenger.requiresInsurance || compliance.insuranceVerified === true)
      && (!profile.passenger.requiresLocalAuthorization || compliance.localAuthorizationVerified === true)
    : false;
}


export function deliveryEligible(profile: RegulatoryProfile, compliance: Record<string, unknown>): boolean {
  return profile.delivery.requiresValidLicense === false || compliance.licenseValid === true
    ? (!profile.delivery.requiresVehicleDocument || compliance.vehicleDocumentVerified === true)
      && (!profile.delivery.requiresInsurance || compliance.insuranceVerified === true)
      && (!profile.delivery.requiresLocalAuthorization || compliance.localAuthorizationVerified === true)
    : false;
}
