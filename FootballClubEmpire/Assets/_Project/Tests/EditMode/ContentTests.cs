using System.Linq;
using FCE.Core.Content;
using NUnit.Framework;

namespace FCE.Core.Tests
{
    public class ContentTests
    {
        [Test]
        public void ShippedContentLoadsAndValidates()
        {
            var db = TestContent.Shipped;
            Assert.That(db.Headquarters.Id, Is.EqualTo("clubhouse"));
            Assert.That(db.Buildings.Count, Is.GreaterThanOrEqualTo(10));
        }

        [Test]
        public void CurveFormulaRoundsToStep()
        {
            var curve = new Curve { Base = 300, Growth = 1.6, Round = 25 };
            Assert.That(curve.Evaluate(1), Is.EqualTo(300));
            Assert.That(curve.Evaluate(2), Is.EqualTo(475));  // 480 -> nearest 25 is 475 (480/25 = 19.2)
            Assert.That(curve.Evaluate(3), Is.EqualTo(775));  // 768 -> 775
        }

        [Test]
        public void ExplicitCurveValuesWin()
        {
            var curve = new Curve { Base = 1, Growth = 2, Values = new long[] { 10, 20, 35 } };
            Assert.That(curve.Evaluate(3), Is.EqualTo(35));
        }

        [Test]
        public void LevelTablesArePrecomputed()
        {
            var shop = TestContent.Shipped.GetLevel("club_shop", 1);
            Assert.That(shop.Cost, Is.EqualTo(300));
            Assert.That(shop.RatePerHour, Is.EqualTo(240));
            Assert.That(shop.Capacity, Is.EqualTo(720));
            Assert.That(shop.RequiredClubhouse, Is.EqualTo(1));
        }

        [Test]
        public void ClubhouseLevelRequirementsAreAttachedToTheirLevel()
        {
            var level4 = TestContent.Shipped.GetLevel("clubhouse", 4);
            Assert.That(level4.Requirements.Select(r => r.Building), Is.EquivalentTo(new[] { "club_shop", "main_stand" }));
            Assert.That(TestContent.Shipped.GetLevel("clubhouse", 2).Requirements, Is.Empty);
        }

        [Test]
        public void AllowedCountFollowsClubhouseLevel()
        {
            var db = TestContent.Shipped;
            Assert.That(db.AllowedCount("club_shop", 1), Is.EqualTo(1));
            Assert.That(db.AllowedCount("club_shop", 4), Is.EqualTo(2));
            Assert.That(db.AllowedCount("youth_pitch", 2), Is.EqualTo(0));
            Assert.That(db.AllowedCount("youth_pitch", 3), Is.EqualTo(1));
        }

        [Test]
        public void UnknownFieldIsRejected()
        {
            var sources = TestContent.ShippedSources();
            sources.Stats = sources.Stats.Replace("\"baseValue\": 1", "\"baseValu\": 1");
            var e = Assert.Throws<ContentException>(() => ContentLoader.Load(sources));
            StringAssert.Contains("baseValu", e.Message);
        }

        [Test]
        public void DanglingStatReferenceIsRejected()
        {
            var sources = TestContent.ShippedSources();
            sources.Buildings["medical.json"] = sources.Buildings["medical.json"].Replace("\"medical_quality\"", "\"medical_qualty\"");
            var e = Assert.Throws<ContentException>(() => ContentLoader.Load(sources));
            Assert.That(e.Errors, Has.Some.Contains("unknown stat 'medical_qualty'"));
        }

        [Test]
        public void WrongLengthCurveIsRejected()
        {
            var sources = TestContent.ShippedSources();
            sources.Buildings["operations.json"] = sources.Buildings["operations.json"].Replace("[2, 4, 6, 8, 10]", "[2, 4, 6, 8]");
            var e = Assert.Throws<ContentException>(() => ContentLoader.Load(sources));
            Assert.That(e.Errors, Has.Some.Contains("lists 4 values but there are 5 levels"));
        }

        [Test]
        public void UnreachableClubhouseRequirementIsRejected()
        {
            // Clubhouse 3 requiring the youth pitch is impossible: the youth pitch needs Clubhouse 3 itself.
            var sources = TestContent.ShippedSources();
            sources.Buildings["operations.json"] = sources.Buildings["operations.json"].Replace(
                "{ \"atLevel\": 3, \"building\": \"training_ground\", \"level\": 2 }",
                "{ \"atLevel\": 3, \"building\": \"youth_pitch\", \"level\": 1 }");
            var e = Assert.Throws<ContentException>(() => ContentLoader.Load(sources));
            Assert.That(e.Errors, Has.Some.Contains("Unreachable"));
        }

        [Test]
        public void OverlappingStartingBuildingsAreRejected()
        {
            var sources = TestContent.ShippedSources();
            sources.Economy = sources.Economy.Replace("\"x\": 12, \"y\": 20", "\"x\": 16, \"y\": 20");
            var e = Assert.Throws<ContentException>(() => ContentLoader.Load(sources));
            Assert.That(e.Errors, Has.Some.Contains("overlaps"));
        }
    }
}
