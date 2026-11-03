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
            Assert.That(db.Headquarters.Id, Is.EqualTo("stadium"));
            Assert.That(db.Headquarters.MaxLevel, Is.EqualTo(25));
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
        public void CurveCanRoundToSignificantFigures()
        {
            var curve = new Curve { Base = 8617, Significant = 2 };
            Assert.That(curve.Evaluate(1), Is.EqualTo(8600));
            Assert.That(new Curve { Base = 9.5, Growth = 1.265, Significant = 2 }.Evaluate(2), Is.EqualTo(12));
            Assert.That(new Curve { Base = 7, Significant = 2 }.Evaluate(1), Is.EqualTo(7));
        }

        [Test]
        public void ExplicitValuesSetTheFirstLevelsThenTheFormulaContinues()
        {
            var curve = new Curve { Values = new long[] { 0, 0, 5 }, Base = 10, Growth = 2 };
            Assert.That(curve.Evaluate(1), Is.EqualTo(0));
            Assert.That(curve.Evaluate(3), Is.EqualTo(5));
            Assert.That(curve.Evaluate(4), Is.EqualTo(80), "10 x 2^3");
        }

        [Test]
        public void ExplicitOnlyCurveStopsAtItsLastValue()
        {
            var curve = new Curve { Values = new long[] { 10, 20, 35 } };
            Assert.That(curve.Evaluate(3), Is.EqualTo(35));
            Assert.Throws<System.ArgumentOutOfRangeException>(() => curve.Evaluate(4));
        }

        [Test]
        public void LevelTablesArePrecomputed()
        {
            var shop = TestContent.Shipped.GetLevel("club_shop", 1);
            Assert.That(shop.Cost, Is.EqualTo(400));
            Assert.That(shop.AmountPerCycle, Is.EqualTo(50));
            Assert.That(shop.CycleSeconds, Is.EqualTo(120));
            Assert.That(shop.IncomePerHour, Is.EqualTo(1500));
            Assert.That(shop.Capacity, Is.EqualTo(12000));
            Assert.That(shop.SecondsToFill, Is.EqualTo(8 * 3600));
            Assert.That(shop.RequiredStadium, Is.EqualTo(3));
        }

        [Test]
        public void LevelsKnowWhichStadiumLevelOpensThem()
        {
            var db = TestContent.Shipped;
            Assert.That(db.GetLevel("drinks_stand", 10).RequiredStadium, Is.EqualTo(1));
            Assert.That(db.GetLevel("drinks_stand", 11).RequiredStadium, Is.EqualTo(2));
            Assert.That(db.GetLevel("drinks_stand", 15).RequiredStadium, Is.EqualTo(3));
            Assert.That(db.MaxLevelAt("drinks_stand", 1), Is.EqualTo(10));
            Assert.That(db.MaxLevelAt("drinks_stand", 4), Is.EqualTo(18));
            Assert.That(db.MaxLevelAt("food_stall", 1), Is.EqualTo(0));
        }

        [Test]
        public void EarlyLevelsAreInstant()
        {
            var db = TestContent.Shipped;
            Assert.That(db.GetLevel("drinks_stand", 1).IsInstant, Is.True);
            Assert.That(db.GetLevel("drinks_stand", 4).IsInstant, Is.True);
            Assert.That(db.GetLevel("drinks_stand", 5).IsInstant, Is.False);
        }

        [Test]
        public void StadiumRequirementsAreAttachedToTheirLevel()
        {
            var level4 = TestContent.Shipped.GetLevel("stadium", 4);
            Assert.That(level4.Requirements.Select(r => r.Building), Is.EquivalentTo(new[] { "club_shop", "medical_room" }));
            Assert.That(TestContent.Shipped.GetLevel("stadium", 2).Requirements, Is.Empty);
        }

        [Test]
        public void AllowedCountFollowsStadiumLevel()
        {
            var db = TestContent.Shipped;
            Assert.That(db.AllowedCount("drinks_stand", 1), Is.EqualTo(1));
            Assert.That(db.AllowedCount("drinks_stand", 5), Is.EqualTo(2));
            Assert.That(db.AllowedCount("youth_pitch", 3), Is.EqualTo(0));
            Assert.That(db.AllowedCount("youth_pitch", 4), Is.EqualTo(1));
        }

        [Test]
        public void ChaptersFollowStadiumLevel()
        {
            var db = TestContent.Shipped;
            Assert.That(db.ChapterAt(1).Name, Is.EqualTo("Grassroots"));
            Assert.That(db.ChapterAt(5).Name, Is.EqualTo("Grassroots"));
            Assert.That(db.ChapterAt(6).Name, Is.EqualTo("Established professional"));
            Assert.That(db.ChapterAt(25).Name, Is.EqualTo("World-class"));
        }

        // ---- The validator catches authoring mistakes ----------------------------------------------------------

        static ContentException Broken(System.Action<ContentLoader.Sources> edit)
        {
            var sources = TestContent.ShippedSources();
            edit(sources);
            return Assert.Throws<ContentException>(() => ContentLoader.Load(sources));
        }

        static void Edit(ContentLoader.Sources s, string file, string from, string to)
        {
            string text = file == "economy" ? s.Economy : file == "stats" ? s.Stats : s.Buildings[file];
            Assert.That(text, Does.Contain(from), "test setup: text to replace not found");
            text = text.Replace(from, to);
            if (file == "economy") s.Economy = text; else if (file == "stats") s.Stats = text; else s.Buildings[file] = text;
        }

        [Test]
        public void UnknownFieldIsRejected()
        {
            var e = Broken(s => Edit(s, "stats", "\"baseValue\": 1", "\"baseValu\": 1"));
            StringAssert.Contains("baseValu", e.Message);
        }

        [Test]
        public void DanglingStatReferenceIsRejected()
        {
            var e = Broken(s => Edit(s, "medical.json", "\"medical_quality\"", "\"medical_qualty\""));
            Assert.That(e.Errors, Has.Some.Contains("unknown stat 'medical_qualty'"));
        }

        [Test]
        public void CurveThatStopsShortIsRejected()
        {
            var e = Broken(s => Edit(s, "stadium.json", "[1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 6, 6, 6, 6]",
                                                        "[1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 6, 6, 6]"));
            Assert.That(e.Errors, Has.Some.Contains("lists 24 values but there are 25 levels"));
        }

        [Test]
        public void LevelsNoStadiumLevelOpensAreRejected()
        {
            var e = Broken(s => Edit(s, "commercial.json", "\"maxLevel\": 30,\n      \"notes\": \"Upgrade cost = income gained x a payback period that starts at 1 minute",
                                                           "\"maxLevel\": 32,\n      \"notes\": \"Upgrade cost = income gained x a payback period that starts at 1 minute"));
            Assert.That(e.Errors, Has.Some.Contains("levels 31-32 are never opened"));
        }

        [Test]
        public void UnreachableStadiumRequirementIsRejected()
        {
            // Stadium 3 requiring the youth pitch is impossible: the youth pitch only opens at Stadium 4.
            var e = Broken(s => Edit(s, "stadium.json", "{\"atLevel\": 3, \"building\": \"training_ground\", \"level\": 5}",
                                                        "{\"atLevel\": 3, \"building\": \"youth_pitch\", \"level\": 1}"));
            Assert.That(e.Errors, Has.Some.Contains("Unreachable"));
        }

        [Test]
        public void OverlappingStartingBuildingsAreRejected()
        {
            var e = Broken(s => Edit(s, "economy", "{\"building\": \"clubhouse\", \"level\": 1, \"x\": 20, \"y\": 26}",
                                                   "{\"building\": \"clubhouse\", \"level\": 1, \"x\": 24, \"y\": 26}"));
            Assert.That(e.Errors, Has.Some.Contains("overlaps"));
        }

        [Test]
        public void LandIsNeverTakenAway()
        {
            var e = Broken(s => Edit(s, "economy", "{\"stadiumLevel\": 2, \"area\": {\"x\": 18, \"y\": 20, \"width\": 28, \"height\": 24}}",
                                                   "{\"stadiumLevel\": 2, \"area\": {\"x\": 18, \"y\": 20, \"width\": 20, \"height\": 24}}"));
            Assert.That(e.Errors, Has.Some.Contains("land is never taken away"));
        }

        [Test]
        public void PricesAboveTheEconomyCeilingAreRejected()
        {
            var e = Broken(s => Edit(s, "stadium.json", "[0, 1000, 8000, 40000, 150000]", "[0, 1000, 8000, 40000, 1000000000000]"));
            Assert.That(e.Errors, Has.Some.Contains("ceiling"));
        }

        [Test]
        public void ProducersMustRecordIncomeUnderAnIncomeCategory()
        {
            var e = Broken(s => Edit(s, "commercial.json", "\"incomeCategory\": \"merchandise\"", "\"incomeCategory\": \"wages\""));
            Assert.That(e.Errors, Has.Some.Contains("not an income category"));
        }
    }
}
