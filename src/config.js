export const config = {
  kart: {
    accel: 22,
    brakeAccel: 30,
    reverseMaxSpeed: 6,
    maxSpeed: 28,
    drag: 0.6,
    steerSpeed: 2.6,
    steerSpeedAtMax: 1.4,
    offTrackMultiplier: 0.5,
    wallBounceDamp: 0.5,
    radius: 1.1,
  },

  drift: {
    slipFactor: 0.45,
    chargeRate: 1.0,
    miniTurboThreshold: 0.7,
    miniTurboBoost: 0.45,
    miniTurboDuration: 1.0,
  },

  camera: {
    distance: 7,
    height: 3.4,
    lookAhead: 4,
    damping: 0.12,
    fovBase: 70,
    fovBoosted: 84,
    fovLerp: 0.08,
  },

  race: {
    laps: 3,
    countdownSeconds: 3,
    startGridSpacing: 3,
  },

  ai: {
    speedJitter: [0.95, 1.0],
    lineOffsetRange: 1.5,
    rubberbandBehind: 0.05,
    rubberbandAhead: -0.03,
    itemDelayRange: [1, 3],
    waypointReachDistance: 4,
  },

  items: {
    boxRespawnSeconds: 3,
    boost: { multiplier: 1.5, duration: 2.0 },
    banana: { spinDuration: 1.0 },
    missile: { speed: 40, lifetime: 5.0, spinDuration: 1.0 },
    shield: { duration: 5.0 },
  },
};
