// Gibraltar - coordinate helpers (see gibraltar/docs/COORDINATES.md).
//
// GIB-LTM is a local Transverse Mercator:
//   +proj=tmerc +lat_0=36.13 +lon_0=-5.35 +k=1 +x_0=0 +y_0=0 +ellps=GRS80 +units=m
// Pipeline/JSON: x = East, y = North, z = Up, metres.
// Unreal:        X = East, Y = South (= -North), Z = Up, centimetres.
//   Unreal (ux, uy, uz) = (x*100, -y*100, z*100)

#pragma once

#include "CoreMinimal.h"

struct GIBRALTAR_API FGibraltarGeo
{
	static constexpr double OriginLonDeg = -5.35;
	static constexpr double OriginLatDeg = 36.13;
	static constexpr double TileSizeM = 500.0;

	/** GIB-LTM metres -> WGS84/ETRS89 longitude & latitude in degrees. */
	static void LtmToLonLat(double X, double Y, double& OutLonDeg, double& OutLatDeg);

	/** Longitude & latitude in degrees -> GIB-LTM metres. */
	static void LonLatToLtm(double LonDeg, double LatDeg, double& OutX, double& OutY);

	/** Unreal world position (cm) -> GIB-LTM (x east m, y north m, z up m). */
	static FVector UnrealToLtm(const FVector& UnrealCm);

	/** GIB-LTM (m) -> Unreal world position (cm). */
	static FVector LtmToUnreal(const FVector& LtmM);

	/** Tile index containing a GIB-LTM point (500 m grid). */
	static FIntPoint TileIndexForLtm(double X, double Y);

	/** Tile id per COORDINATES.md: (0,0)->T_E0_N0, (-1,3)->T_W1_N3, (1,-5)->T_E1_S5. */
	static FString TileId(int32 Ix, int32 Iy);

	/** "36.130500° N  5.342500° W". */
	static FString FormatLonLat(double LonDeg, double LatDeg);

	/** Compass heading in degrees (0 = north, 90 = east) for an Unreal yaw. */
	static double YawToCompassHeading(double UnrealYawDeg);

	/** Unreal yaw for a compass heading (0 = north, 90 = east). */
	static double CompassHeadingToYaw(double HeadingDeg);

	/** "N", "NE", ... for a compass heading. */
	static const TCHAR* CompassPoint(double HeadingDeg);

	/**
	 * Checks the projection maths against reference values (computed with PROJ).
	 * Returns false and logs an error if anything is off by more than 1 mm.
	 */
	static bool RunSelfTest();
};
