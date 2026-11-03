using System.Linq;
using NUnit.Framework;

namespace FCE.Core.Tests
{
    public class StatsTests
    {
        [Test]
        public void StatsAreBasePlusEveryBuildingAtItsLevel()
        {
            var t = new TestGame();
            // Base 100 plus the level-1 Main Stand's 150.
            Assert.That(t.Game.Stats.Get("stadium_capacity"), Is.EqualTo(250));
            // Base 20 plus the level-1 Pitch's 25.
            Assert.That(t.Game.Stats.Get("pitch_quality"), Is.EqualTo(45));
            Assert.That(t.Game.Stats.Get("reputation"), Is.EqualTo(5));
        }

        [Test]
        public void StatsChangeOnCompletionNotOnStart()
        {
            var t = new TestGame();
            var stand = t.Find("main_stand");
            t.Game.StartUpgrade(stand.Id);
            Assert.That(t.Game.Stats.Get("stadium_capacity"), Is.EqualTo(250), "the old stand stays open while the new one is built");
            t.Wait(stand.Construction.EndsAt - t.Clock.UtcNowSeconds);
            Assert.That(t.Game.Stats.Get("stadium_capacity"), Is.EqualTo(350));
            Assert.That(t.Game.Stats.Get("seated_capacity"), Is.EqualTo(100));
        }

        [Test]
        public void SeveralBuildingsContributeToOneStat()
        {
            var t = new TestGame();
            t.ForceLevel(t.Find("clubhouse").Id, 2);
            var shed = t.Game.PlaceBuilding("groundskeepers_shed", 32, 12);
            Assert.That(shed.Ok, Is.True, shed.Error);
            t.Wait(3600);
            Assert.That(t.Game.Stats.Get("pitch_quality"), Is.EqualTo(20 + 25 + 2));
        }

        [Test]
        public void QuoteShowsCostTimeAndStatChanges()
        {
            var t = new TestGame();
            var quote = t.Game.QuoteUpgrade(t.Find("main_stand").Id);
            Assert.That(quote.CanStart, Is.True);
            Assert.That(quote.NextLevel.Level, Is.EqualTo(2));
            Assert.That(quote.NextLevel.Cost, Is.EqualTo(t.Content.GetLevel("main_stand", 2).Cost));
            var capacity = quote.StatChanges.Single(s => s.Stat == "stadium_capacity");
            Assert.That((capacity.From, capacity.To), Is.EqualTo((150L, 250L)));
        }

        [Test]
        public void QuoteExplainsWhyAnUpgradeIsBlocked()
        {
            var t = new TestGame();
            var pitch = t.Find("pitch");
            t.ForceLevel(pitch.Id, 2);
            Assert.That(t.Game.QuoteUpgrade(pitch.Id).BlockedBy, Is.EqualTo(Errors.ClubhouseTooLow));
            Assert.That(t.Game.QuoteUpgrade(pitch.Id).NextLevel.RequiredClubhouse, Is.EqualTo(2));
        }
    }
}
