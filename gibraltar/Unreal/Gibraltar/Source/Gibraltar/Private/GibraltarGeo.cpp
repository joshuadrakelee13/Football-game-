// Gibraltar - coordinate helpers.
//
// Transverse Mercator via the Krueger series to 4th order in n (Karney 2011,
// "Transverse Mercator with an accuracy of a few nanometers"). Within the
// few kilometres of Gibraltar this agrees with PROJ to well under 1 micrometre.
//
// Reference values (computed with pyproj 3.8 / PROJ for the GIB-LTM string):
//   GIB-LTM (0, 0)             = lon -5.35,        lat 36.13        (origin)
//   GIB-LTM (675.112, 55.507)  = lon -5.342499998, lat 36.130500002 (~ -5.3425, 36.1305)
//   lon -5.3434 lat 36.1441    = GIB-LTM (593.9959, 1564.5779)
//   lon -5.37   lat 36.10      = GIB-LTM (-1800.9944, -3328.6488)
//   GIB-LTM (-1500, -2500)     = lon -5.366659041, lat 36.107468445

#include "GibraltarGeo.h"
#include "Gibraltar.h"

#include <cmath>

namespace
{
	struct FTmConstants
	{
		double A = 0.0;          // rectifying radius * k0
		double C = 0.0;          // 2 sqrt(n) / (1 + n)
		double Alpha[4] = {};
		double Beta[4] = {};
		double Delta[4] = {};
		double Lon0 = 0.0;       // radians
		double N0 = 0.0;         // northing of the origin latitude on the central meridian

		FTmConstants()
		{
			const double a = 6378137.0;               // GRS80
			const double f = 1.0 / 298.257222101;     // GRS80
			const double k0 = 1.0;
			const double n = f / (2.0 - f);
			const double n2 = n * n, n3 = n2 * n, n4 = n3 * n;

			A = k0 * a / (1.0 + n) * (1.0 + n2 / 4.0 + n4 / 64.0);
			C = 2.0 * std::sqrt(n) / (1.0 + n);

			Alpha[0] = n / 2.0 - 2.0 / 3.0 * n2 + 5.0 / 16.0 * n3 + 41.0 / 180.0 * n4;
			Alpha[1] = 13.0 / 48.0 * n2 - 3.0 / 5.0 * n3 + 557.0 / 1440.0 * n4;
			Alpha[2] = 61.0 / 240.0 * n3 - 103.0 / 140.0 * n4;
			Alpha[3] = 49561.0 / 161280.0 * n4;

			Beta[0] = n / 2.0 - 2.0 / 3.0 * n2 + 37.0 / 96.0 * n3 - 1.0 / 360.0 * n4;
			Beta[1] = 1.0 / 48.0 * n2 + 1.0 / 15.0 * n3 - 437.0 / 1440.0 * n4;
			Beta[2] = 17.0 / 480.0 * n3 - 37.0 / 840.0 * n4;
			Beta[3] = 4397.0 / 161280.0 * n4;

			Delta[0] = 2.0 * n - 2.0 / 3.0 * n2 - 2.0 * n3 + 116.0 / 45.0 * n4;
			Delta[1] = 7.0 / 3.0 * n2 - 8.0 / 5.0 * n3 - 227.0 / 45.0 * n4;
			Delta[2] = 56.0 / 15.0 * n3 - 136.0 / 35.0 * n4;
			Delta[3] = 4279.0 / 630.0 * n4;

			Lon0 = FMath::DegreesToRadians(FGibraltarGeo::OriginLonDeg);

			double E = 0.0;
			ForwardRaw(FMath::DegreesToRadians(FGibraltarGeo::OriginLatDeg), Lon0, E, N0);
		}

		/** Easting/northing from the equator on the central meridian (no false origin). */
		void ForwardRaw(double LatRad, double LonRad, double& OutE, double& OutN) const
		{
			const double SinLat = std::sin(LatRad);
			const double T = std::sinh(std::atanh(SinLat) - C * std::atanh(C * SinLat));
			const double DLon = LonRad - Lon0;
			const double XiP = std::atan2(T, std::cos(DLon));
			const double EtaP = std::atanh(std::sin(DLon) / std::sqrt(1.0 + T * T));

			double Xi = XiP;
			double Eta = EtaP;
			for (int32 J = 0; J < 4; ++J)
			{
				const double K = 2.0 * (J + 1);
				Xi += Alpha[J] * std::sin(K * XiP) * std::cosh(K * EtaP);
				Eta += Alpha[J] * std::cos(K * XiP) * std::sinh(K * EtaP);
			}
			OutE = A * Eta;
			OutN = A * Xi;
		}
	};

	const FTmConstants& Tm()
	{
		static const FTmConstants Constants;
		return Constants;
	}
}

void FGibraltarGeo::LonLatToLtm(double LonDeg, double LatDeg, double& OutX, double& OutY)
{
	const FTmConstants& K = Tm();
	double E = 0.0, N = 0.0;
	K.ForwardRaw(FMath::DegreesToRadians(LatDeg), FMath::DegreesToRadians(LonDeg), E, N);
	OutX = E;
	OutY = N - K.N0;
}

void FGibraltarGeo::LtmToLonLat(double X, double Y, double& OutLonDeg, double& OutLatDeg)
{
	const FTmConstants& K = Tm();
	const double Xi = (Y + K.N0) / K.A;
	const double Eta = X / K.A;

	double XiP = Xi;
	double EtaP = Eta;
	for (int32 J = 0; J < 4; ++J)
	{
		const double M = 2.0 * (J + 1);
		XiP -= K.Beta[J] * std::sin(M * Xi) * std::cosh(M * Eta);
		EtaP -= K.Beta[J] * std::cos(M * Xi) * std::sinh(M * Eta);
	}

	const double Chi = std::asin(std::sin(XiP) / std::cosh(EtaP));
	double Lat = Chi;
	for (int32 J = 0; J < 4; ++J)
	{
		Lat += K.Delta[J] * std::sin(2.0 * (J + 1) * Chi);
	}
	const double Lon = K.Lon0 + std::atan2(std::sinh(EtaP), std::cos(XiP));

	OutLonDeg = FMath::RadiansToDegrees(Lon);
	OutLatDeg = FMath::RadiansToDegrees(Lat);
}

FVector FGibraltarGeo::UnrealToLtm(const FVector& UnrealCm)
{
	return FVector(UnrealCm.X / 100.0, -UnrealCm.Y / 100.0, UnrealCm.Z / 100.0);
}

FVector FGibraltarGeo::LtmToUnreal(const FVector& LtmM)
{
	return FVector(LtmM.X * 100.0, -LtmM.Y * 100.0, LtmM.Z * 100.0);
}

FIntPoint FGibraltarGeo::TileIndexForLtm(double X, double Y)
{
	const int32 Ix = static_cast<int32>(std::floor(X / TileSizeM));
	const int32 Iy = static_cast<int32>(std::floor(Y / TileSizeM));
	return FIntPoint(Ix, Iy);
}

FString FGibraltarGeo::TileId(int32 Ix, int32 Iy)
{
	const FString XPart = Ix >= 0 ? FString::Printf(TEXT("E%d"), Ix) : FString::Printf(TEXT("W%d"), -Ix);
	const FString YPart = Iy >= 0 ? FString::Printf(TEXT("N%d"), Iy) : FString::Printf(TEXT("S%d"), -Iy);
	return FString::Printf(TEXT("T_%s_%s"), *XPart, *YPart);
}

FString FGibraltarGeo::FormatLonLat(double LonDeg, double LatDeg)
{
	return FString::Printf(TEXT("%.6f%s %s   %.6f%s %s"),
		FMath::Abs(LatDeg), TEXT("°"), LatDeg >= 0.0 ? TEXT("N") : TEXT("S"),
		FMath::Abs(LonDeg), TEXT("°"), LonDeg >= 0.0 ? TEXT("E") : TEXT("W"));
}

double FGibraltarGeo::YawToCompassHeading(double UnrealYawDeg)
{
	// Unreal yaw 0 = +X = east, yaw 90 = +Y = south. Compass 0 = north, 90 = east.
	double H = FMath::Fmod(UnrealYawDeg + 90.0, 360.0);
	if (H < 0.0)
	{
		H += 360.0;
	}
	return H;
}

double FGibraltarGeo::CompassHeadingToYaw(double HeadingDeg)
{
	return FRotator::NormalizeAxis(HeadingDeg - 90.0);
}

const TCHAR* FGibraltarGeo::CompassPoint(double HeadingDeg)
{
	static const TCHAR* Points[8] = { TEXT("N"), TEXT("NE"), TEXT("E"), TEXT("SE"), TEXT("S"), TEXT("SW"), TEXT("W"), TEXT("NW") };
	double H = FMath::Fmod(HeadingDeg, 360.0);
	if (H < 0.0)
	{
		H += 360.0;
	}
	const int32 Index = static_cast<int32>(std::floor((H + 22.5) / 45.0)) % 8;
	return Points[Index];
}

bool FGibraltarGeo::RunSelfTest()
{
	bool bOk = true;

	struct FRef { double Lon, Lat, X, Y; };
	const FRef Refs[] = {
		{ -5.35,   36.13,      0.0,       0.0 },
		{ -5.3425, 36.1305,  675.1118,   55.5068 },
		{ -5.3434, 36.1441,  593.9959, 1564.5779 },
		{ -5.37,   36.10,  -1800.9944, -3328.6488 },
	};

	for (const FRef& R : Refs)
	{
		double X = 0.0, Y = 0.0;
		LonLatToLtm(R.Lon, R.Lat, X, Y);
		if (FMath::Abs(X - R.X) > 0.001 || FMath::Abs(Y - R.Y) > 0.001)
		{
			UE_LOG(LogGibraltar, Error, TEXT("GIB-LTM forward self-test failed: (%f, %f) -> (%.4f, %.4f), expected (%.4f, %.4f)"),
				R.Lon, R.Lat, X, Y, R.X, R.Y);
			bOk = false;
		}

		double Lon = 0.0, Lat = 0.0;
		LtmToLonLat(R.X, R.Y, Lon, Lat);
		// 1e-7 degrees is ~1 cm; the reference XY are rounded to 0.1 mm.
		if (FMath::Abs(Lon - R.Lon) > 1e-7 || FMath::Abs(Lat - R.Lat) > 1e-7)
		{
			UE_LOG(LogGibraltar, Error, TEXT("GIB-LTM inverse self-test failed: (%.4f, %.4f) -> (%.9f, %.9f), expected (%.9f, %.9f)"),
				R.X, R.Y, Lon, Lat, R.Lon, R.Lat);
			bOk = false;
		}
	}

	if (TileId(0, 0) != TEXT("T_E0_N0") || TileId(-1, 3) != TEXT("T_W1_N3") || TileId(1, -5) != TEXT("T_E1_S5"))
	{
		UE_LOG(LogGibraltar, Error, TEXT("Tile id self-test failed."));
		bOk = false;
	}

	if (bOk)
	{
		UE_LOG(LogGibraltar, Log, TEXT("GIB-LTM projection self-test passed."));
	}
	return bOk;
}
