export type UserRole =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "OPERATOR"
  | "FINANCE"
  | "DRIVER"
  | "PASSENGER";

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
