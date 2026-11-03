using System.Linq;
using NUnit.Framework;
using static FCE.Core.Tests.TestGame;

namespace FCE.Core.Tests
{
    public class StatsTests
    {
        long StatAt(string building, int level, string stat) => TestContent.Shipped.GetLevel(building, level).Stats[stat];

        [Test]
        public void StatsAreBasePlusEveryBuildingAtItsLevel()
        {
            var t = new TestGame();
            Assert.That(t.Game.Stats.Get("stadium_capacity"), Is.EqualTo(250));
            Assert.That(t.Game.Stats.Get("pitch_quality"), Is.EqualTo(20));
            Assert.That(t.Game.Stats.Get("reputation"), Is.EqualTo(5 + 2), "Stadium 5, Clubhouse 2");
            Assert.That(t.Game.Stats.Get("training_quality"), Is.EqualTo(10), "base value; no training ground yet");
        }

        [Test]
        public void StatsChangeOnCompletionNotOnStart()
        {
            var t = new TestGame();
            t.GiveCash(1000);
            t.Game.StartUpgrade(t.Stadium.Id);
            Assert.That(t.Game.Stats.Get("stadium_capacity"), Is.EqualTo(250), "the old ground stays open while work goes on");
            t.Finish(t.Stadium.Id);
            Assert.That(t.Game.Stats.Get("stadium_capacity"), Is.EqualTo(StatAt("stadium", 2, "stadium_capacity")));
            Assert.That(t.Game.Stats.Get("stadium_capacity"), Is.GreaterThan(250));
        }

        [Test]
        public void SeveralBuildingsContributeToOneStat()
        {
            var t = new TestGame();
            t.ReachStadium(2);
            t.Build("groundskeepers_shed");
            Assert.That(t.Game.Stats.Get("pitch_quality"),
                Is.EqualTo(StatAt("stadium", 2, "pitch_quality") + StatAt("groundskeepers_shed", 1, "pitch_quality")));
        }

        [Test]
        public void QuoteShowsCostTimeAndStatChanges()
        {
            var t = new TestGame();
            int ground = t.Build("training_ground");
            var quote = t.Game.QuoteUpgrade(ground);
            Assert.That(quote.CanStart, Is.True);
            Assert.That(quote.NextLevel.Level, Is.EqualTo(2));
            Assert.That(quote.NextLevel.Cost, Is.EqualTo(t.Content.GetLevel("training_ground", 2).Cost));
            var change = quote.StatChanges.Single(s => s.Stat == "training_quality");
            Assert.That((change.From, change.To), Is.EqualTo((StatAt("training_ground", 1, "training_quality"), StatAt("training_ground", 2, "training_quality"))));
        }

        [Test]
        public void QuoteExplainsWhyAnUpgradeIsBlocked()
        {
            var t = new TestGame();
            int stand = t.Game.PlaceBuilding("drinks_stand", FreeX, FreeY).BuildingId;
            t.ForceLevel(stand, 10);
            var quote = t.Game.QuoteUpgrade(stand);
            Assert.That(quote.BlockedBy, Is.EqualTo(Errors.StadiumTooLow));
            Assert.That(quote.NextLevel.RequiredStadium, Is.EqualTo(2));
        }
    }
}
