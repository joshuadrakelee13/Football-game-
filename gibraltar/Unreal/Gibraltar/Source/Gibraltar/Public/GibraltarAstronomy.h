// Gibraltar - sun & moon positions and Europe/Gibraltar civil time.

#pragma once

#include "CoreMinimal.h"

/** Horizontal coordinates of a sky body. */
struct GIBRALTAR_API FGibraltarSkyPosition
{
	/** Degrees above the horizon (refraction/parallax corrected). */
	double ElevationDeg = 0.0;
	/** Degrees clockwise from true north (90 = east, 180 = south). */
	double AzimuthDeg = 0.0;
};

struct GIBRALTAR_API FGibraltarAstronomy
{
	/**
	 * Solar position, NOAA spreadsheet algorithm (Meeus-based, ~0.01 deg).
	 * @param Utc          time in UTC
	 * @param OutEclipticLonDeg optional: apparent ecliptic longitude of the sun
	 */
	static FGibraltarSkyPosition SunPosition(const FDateTime& Utc, double LatDeg, double LonDeg, double* OutEclipticLonDeg = nullptr);

	/**
	 * Low-precision lunar position (Astronomical Almanac series, ~0.3 deg) with
	 * topocentric parallax correction. Also returns the illuminated fraction 0..1.
	 */
	static FGibraltarSkyPosition MoonPosition(const FDateTime& Utc, double LatDeg, double LonDeg, double& OutIlluminatedFraction);

	/** EU rule: summer time from 01:00 UTC on the last Sunday of March to 01:00 UTC on the last Sunday of October. */
	static bool IsEuSummerTime(const FDateTime& Utc);

	/** Europe/Gibraltar offset from UTC at that instant: +1 h (CET) or +2 h (CEST). */
	static FTimespan GibraltarUtcOffset(const FDateTime& Utc);

	static FDateTime UtcToGibraltarLocal(const FDateTime& Utc);

	/** Local wall-clock time -> UTC. In the repeated autumn hour the summer-time reading is used. */
	static FDateTime GibraltarLocalToUtc(const FDateTime& Local);

	/**
	 * Unit vector pointing from the ground TOWARD the body, in Unreal axes
	 * (X = east, Y = south, Z = up). A directional light's forward vector is
	 * the negative of this.
	 */
	static FVector DirectionToUnreal(const FGibraltarSkyPosition& Position);
};
