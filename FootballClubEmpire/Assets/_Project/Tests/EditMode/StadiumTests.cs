using System.Linq;
using FCE.Core.Content;
using FCE.Core.Economy;
using NUnit.Framework;

namespace FCE.Core.Tests
{
    public class StadiumTests
    {
        [Test]
        public void StadiumMilestonePaysItsReward()
        {
            var t = new TestGame();
            t.ReachStadium(2);
            long cashBefore = t.Game.Balance(Currencies.Cash), creditsBefore = t.Game.Balance(Currencies.Credits);
            t.ReachStadium(3);
            Assert.That(t.State.Ledger.Lifetime.Income[LedgerCategories.Rewards], Is.EqualTo(1000));
            Assert.That(t.Game.Balance(Currencies.Credits), Is.EqualTo(creditsBefore + 20));
        }

        [Test]
        public void StadiumMilestoneAnnouncesWhatItOpened()
        {
            var t = new TestGame();
            t.ReachStadium(3);
            var reached = t.EventsOf<StadiumLevelReached>().Single(e => e.Level == 3);
            Assert.That(reached.Unlocks.NewBuildings.Select(n => n.def.Id), Is.EquivalentTo(new[] { "club_shop", "gym" }));
            Assert.That(reached.Unlocks.ExtraCrews, Is.EqualTo(1));
            Assert.That(reached.Unlocks.NewLandTiles, Is.GreaterThan(0));
            Assert.That(reached.Unlocks.Reward[Currencies.Cash], Is.EqualTo(1000));
            Assert.That(t.Game.TotalCrews, Is.EqualTo(3));
        }

        [Test]
        public void StadiumFiveOpensASecondDrinksStand()
        {
            var u = new TestGame().Game.UnlocksAtStadium(5);
            var extra = u.ExtraInstances.Single(e => e.def.Id == "drinks_stand");
            Assert.That((extra.from, extra.to), Is.EqualTo((1, 2)));
        }

        [Test]
        public void UnlocksCountTheNewProgressionTheyOpen()
        {
            // Stadium 2: three new buildings at up to level 10 each, plus two more levels on the three existing types.
            var u = new TestGame().Game.UnlocksAtStadium(2);
            Assert.That(u.NewBuildings.Select(n => n.def.Id), Is.EquivalentTo(new[] { "food_stall", "medical_room", "groundskeepers_shed" }));
            Assert.That(u.RaisedCaps.Select(c => c.def.Id), Is.EquivalentTo(new[] { "drinks_stand", "training_ground", "clubhouse" }));
            Assert.That(u.NewUpgradeLevels, Is.EqualTo(3 * 10 + 3 * 2));
        }

        [Test]
        public void EveryGrassrootsStadiumLevelOpensSomethingNew()
        {
            var game = new TestGame().Game;
            for (int level = 2; level <= 5; level++)
            {
                var u = game.UnlocksAtStadium(level);
                Assert.That(u.NewBuildings.Count + u.ExtraInstances.Count, Is.GreaterThan(0), $"Stadium {level} should open a new building or a new copy");
            }
        }

        [Test]
        public void ChapterChangesAreAnnounced()
        {
            var game = new TestGame().Game;
            Assert.That(game.UnlocksAtStadium(6).NewChapter.Name, Is.EqualTo("Established professional"));
            Assert.That(game.UnlocksAtStadium(5).NewChapter, Is.Null);
        }
    }
}
