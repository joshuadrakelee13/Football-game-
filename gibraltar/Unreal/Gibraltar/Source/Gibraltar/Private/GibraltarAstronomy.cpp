// Gibraltar - sun & moon positions and Europe/Gibraltar civil time.
//
// Sanity values for Gibraltar (lat 36.13, lon -5.35), checked against a
// reference implementation:
//   2026-06-21 12:00 UTC: sun elevation 76.4 deg, azimuth 157 deg (SSE)
//   2026-06-21 05:00 UTC: sun elevation -1.6 deg, azimuth 59 deg (sunrise ~05:10 UTC = 07:10 CEST)
//   2026-03-20 12:22 UTC: sun elevation 53.8 deg, azimuth 177 deg
//   2026-03-03 23:00 UTC: moon elevation ~47 deg, azimuth ~135 deg, illuminated ~1.0 (full moon)

#include "GibraltarAstronomy.h"

#include <cmath>

namespace
{
	inline double Rad(double Deg) { return Deg * (UE_DOUBLE_PI / 180.0); }
	inline double Deg(double R) { return R * (180.0 / UE_DOUBLE_PI); }
	inline double SinD(double D) { return std::sin(Rad(D)); }
	inline double CosD(double D) { return std::cos(Rad(D)); }
	inline double Wrap360(double D)
	{
		D = std::fmod(D, 360.0);
		return D < 0.0 ? D + 360.0 : D;
	}

	/** Alt/az from equatorial coordinates and local hour angle (all degrees). */
	FGibraltarSkyPosition HorizontalFromEquatorial(double LatDeg, double DeclDeg, double HourAngleDeg)
	{
		const double Lat = Rad(LatDeg);
		const double Dec = Rad(DeclDeg);
		const double H = Rad(HourAngleDeg);

		const double SinAlt = std::sin(Lat) * std::sin(Dec) + std::cos(Lat) * std::cos(Dec) * std::cos(H);
		FGibraltarSkyPosition Out;
		Out.ElevationDeg = Deg(std::asin(FMath::Clamp(SinAlt, -1.0, 1.0)));
		// Azimuth measured from south, westward -> +180 gives from north, clockwise.
		Out.AzimuthDeg = Wrap360(Deg(std::atan2(std::sin(H), std::cos(H) * std::sin(Lat) - std::tan(Dec) * std::cos(Lat))) + 180.0);
		return Out;
	}

	/** NOAA atmospheric refraction correction in degrees for an apparent elevation. */
	double RefractionDeg(double ElevationDeg)
	{
		if (ElevationDeg > 85.0)
		{
			return 0.0;
		}
		const double TanE = std::tan(Rad(ElevationDeg));
		double ArcSec = 0.0;
		if (ElevationDeg > 5.0)
		{
			ArcSec = 58.1 / TanE - 0.07 / (TanE * TanE * TanE) + 0.000086 / std::pow(TanE, 5.0);
		}
		else if (ElevationDeg > -0.575)
		{
			ArcSec = 1735.0 + ElevationDeg * (-518.2 + ElevationDeg * (103.4 + ElevationDeg * (-12.79 + ElevationDeg * 0.711)));
		}
		else
		{
			ArcSec = -20.772 / TanE;
		}
		return ArcSec / 3600.0;
	}

	FDateTime LastSundayOfMonthAt0100Utc(int32 Year, int32 Month)
	{
		int32 Day = FDateTime::DaysInMonth(Year, Month);
		while (FDateTime(Year, Month, Day).GetDayOfWeek() != EDayOfWeek::Sunday)
		{
			--Day;
		}
		return FDateTime(Year, Month, Day, 1, 0, 0);
	}
}

FGibraltarSkyPosition FGibraltarAstronomy::SunPosition(const FDateTime& Utc, double LatDeg, double LonDeg, double* OutEclipticLonDeg)
{
	const double JD = Utc.GetJulianDay();
	const double T = (JD - 2451545.0) / 36525.0;

	const double L0 = Wrap360(280.46646 + T * (36000.76983 + T * 0.0003032));
	const double M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
	const double E = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
	const double C = SinD(M) * (1.914602 - T * (0.004817 + 0.000014 * T))
		+ SinD(2.0 * M) * (0.019993 - 0.000101 * T)
		+ SinD(3.0 * M) * 0.000289;
	const double TrueLon = L0 + C;
	const double Omega = 125.04 - 1934.136 * T;
	const double AppLon = TrueLon - 0.00569 - 0.00478 * SinD(Omega);
	const double MeanObliq = 23.0 + (26.0 + ((21.448 - T * (46.815 + T * (0.00059 - T * 0.001813)))) / 60.0) / 60.0;
	const double Obliq = MeanObliq + 0.00256 * CosD(Omega);
	const double Decl = Deg(std::asin(SinD(Obliq) * SinD(AppLon)));

	const double Y = std::pow(std::tan(Rad(Obliq / 2.0)), 2.0);
	const double EqTimeMin = 4.0 * Deg(
		Y * SinD(2.0 * L0)
		- 2.0 * E * SinD(M)
		+ 4.0 * E * Y * SinD(M) * CosD(2.0 * L0)
		- 0.5 * Y * Y * SinD(4.0 * L0)
		- 1.25 * E * E * SinD(2.0 * M));

	const double MinutesUtc = Utc.GetTimeOfDay().GetTotalMinutes();
	double TrueSolarTime = std::fmod(MinutesUtc + EqTimeMin + 4.0 * LonDeg, 1440.0);
	if (TrueSolarTime < 0.0)
	{
		TrueSolarTime += 1440.0;
	}
	const double HourAngle = TrueSolarTime / 4.0 - 180.0;

	FGibraltarSkyPosition Out = HorizontalFromEquatorial(LatDeg, Decl, HourAngle);
	Out.ElevationDeg += RefractionDeg(Out.ElevationDeg);

	if (OutEclipticLonDeg)
	{
		*OutEclipticLonDeg = Wrap360(AppLon);
	}
	return Out;
}

FGibraltarSkyPosition FGibraltarAstronomy::MoonPosition(const FDateTime& Utc, double LatDeg, double LonDeg, double& OutIlluminatedFraction)
{
	const double D = Utc.GetJulianDay() - 2451545.0;
	const double T = D / 36525.0;

	const double Lambda = 218.32 + 481267.881 * T
		+ 6.29 * SinD(135.0 + 477198.87 * T)
		- 1.27 * SinD(259.3 - 413335.36 * T)
		+ 0.66 * SinD(235.7 + 890534.22 * T)
		+ 0.21 * SinD(269.9 + 954397.74 * T)
		- 0.19 * SinD(357.5 + 35999.05 * T)
		- 0.11 * SinD(186.5 + 966404.03 * T);
	const double Beta = 5.13 * SinD(93.3 + 483202.03 * T)
		+ 0.28 * SinD(228.2 + 960400.89 * T)
		- 0.28 * SinD(318.3 + 6003.15 * T)
		- 0.17 * SinD(217.6 - 407332.21 * T);
	const double Eps = 23.439 - 0.0000004 * D;

	const double L = CosD(Beta) * CosD(Lambda);
	const double Mm = CosD(Eps) * CosD(Beta) * SinD(Lambda) - SinD(Eps) * SinD(Beta);
	const double N = SinD(Eps) * CosD(Beta) * SinD(Lambda) + CosD(Eps) * SinD(Beta);
	const double RA = Deg(std::atan2(Mm, L));
	const double Decl = Deg(std::asin(FMath::Clamp(N, -1.0, 1.0)));

	const double Gmst = 280.46061837 + 360.98564736629 * D;
	const double HourAngle = Wrap360(Gmst + LonDeg - RA);

	FGibraltarSkyPosition Out = HorizontalFromEquatorial(LatDeg, Decl, HourAngle);
	// Topocentric parallax (horizontal parallax ~0.95 deg), then refraction.
	Out.ElevationDeg -= 0.95 * CosD(Out.ElevationDeg);
	Out.ElevationDeg += RefractionDeg(Out.ElevationDeg);

	double SunLon = 0.0;
	SunPosition(Utc, LatDeg, LonDeg, &SunLon);
	const double CosElongation = CosD(Beta) * CosD(Lambda - SunLon);
	OutIlluminatedFraction = FMath::Clamp((1.0 - CosElongation) * 0.5, 0.0, 1.0);
	return Out;
}

bool FGibraltarAstronomy::IsEuSummerTime(const FDateTime& Utc)
{
	const int32 Year = Utc.GetYear();
	const FDateTime Start = LastSundayOfMonthAt0100Utc(Year, 3);
	const FDateTime End = LastSundayOfMonthAt0100Utc(Year, 10);
	return Utc >= Start && Utc < End;
}

FTimespan FGibraltarAstronomy::GibraltarUtcOffset(const FDateTime& Utc)
{
	return FTimespan::FromHours(IsEuSummerTime(Utc) ? 2.0 : 1.0);
}

FDateTime FGibraltarAstronomy::UtcToGibraltarLocal(const FDateTime& Utc)
{
	return Utc + GibraltarUtcOffset(Utc);
}

FDateTime FGibraltarAstronomy::GibraltarLocalToUtc(const FDateTime& Local)
{
	const FDateTime SummerGuess = Local - FTimespan::FromHours(2.0);
	if (IsEuSummerTime(SummerGuess))
	{
		return SummerGuess;
	}
	return Local - FTimespan::FromHours(1.0);
}

FVector FGibraltarAstronomy::DirectionToUnreal(const FGibraltarSkyPosition& Position)
{
	const double CosEl = CosD(Position.ElevationDeg);
	const double East = SinD(Position.AzimuthDeg) * CosEl;
	const double North = CosD(Position.AzimuthDeg) * CosEl;
	const double Up = SinD(Position.ElevationDeg);
	// Unreal: X = east, Y = south = -north, Z = up.
	return FVector(East, -North, Up).GetSafeNormal();
}
