export type UserRole =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "OPERATOR"
  | "FINANCE"
  | "DRIVER"
  | "PASSENGER"
  | "STORE"
  | "COURIER";

export type RideStatus =
  | "REQUESTED"
  | "SEARCHING"
  | "OFFERED"
  | "ACCEPTED"
  | "DRIVER_ARRIVING"
  | "DRIVER_ARRIVED"
  | "TRIP_STARTED"
  | "TRIP_COMPLETED"
  | "CANCELLED"
  | "EXPIRED"
  | "NO_DRIVER"
  | "FAILED";

export interface GeoPointValue {
  latitude: number;
  longitude: number;
}

export interface Ride {
  id: string;
  passengerId: string;
  driverId?: string;
  pickup: GeoPointValue;
  destination: GeoPointValue;
  status: RideStatus;
  estimatedDistanceKm: number;
  estimatedDurationMin: number;
  estimatedFareCents: number;
  createdAt: string;
  updatedAt: string;
}

export interface Driver {
  id: string;
  displayName: string;
  email?: string;
  city: string;
  approved: boolean;
  online: boolean;
  latitude?: number;
  longitude?: number;
  vehicleId?: string;
  status: "PENDING_APPROVAL" | "APPROVED" | "REJECTED";
}

export interface PricingConfig {
  baseFareCents: number;
  perKmCents: number;
  perMinuteCents: number;
  minimumFareCents: number;
  cancellationFeeCents: number;
  commissionPercent: number;
}

export interface RideOffer {
  id: string;
  rideId: string;
  driverId: string;
  status: "OFFERED" | "ACCEPTED" | "REJECTED" | "EXPIRED";
  distanceToPickupKm: number;
  createdAt: string;
}


export type ServiceType = "RIDE" | "DELIVERY";
export type DeliveryStatus =
  | "SEARCHING_COURIER" | "OFFERED" | "ACCEPTED" | "GOING_TO_PICKUP"
  | "ARRIVED_PICKUP" | "PICKED_UP" | "IN_DELIVERY" | "ARRIVED_DESTINATION"
  | "DELIVERED" | "CANCELLED" | "EXPIRED" | "NO_COURIER" | "FAILED";

export interface Store {
  id: string;
  ownerId: string;
  displayName: string;
  email?: string;
  status: "PENDING_APPROVAL" | "APPROVED" | "REJECTED";
  active: boolean;
  address?: Record<string, unknown>;
}

export interface Delivery {
  id: string;
  storeId: string;
  courierId?: string;
  pickup: GeoPointValue;
  destination: GeoPointValue;
  status: DeliveryStatus;
  estimatedDistanceKm: number;
  estimatedDurationMin: number;
  estimatedFareCents: number;
  paymentStatus: string;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceOffer {
  id: string;
  serviceId: string;
  serviceType: ServiceType;
  courierId: string;
  status: "OFFERED" | "ACCEPTED" | "REJECTED" | "EXPIRED";
  distanceToPickupKm: number;
  createdAt: string;
}
