using System.Linq;
using FCE.Core.Content;
using NUnit.Framework;
using static FCE.Core.Tests.TestGame;

namespace FCE.Core.Tests
{
    public class ConstructionTests
    {
        [Test]
        public void NewClubMatchesEconomyFile()
        {
            var t = new TestGame();
            Assert.That(t.Game.StadiumLevel, Is.EqualTo(1));
            Assert.That(t.Game.Chapter.Name, Is.EqualTo("Grassroots"));
            Assert.That(t.Game.Balance(Currencies.Cash), Is.EqualTo(500));
            Assert.That(t.Game.Balance(Currencies.Credits), Is.EqualTo(100));
            Assert.That(t.State.Buildings.Select(b => b.Def), Is.EquivalentTo(new[] { "stadium", "clubhouse" }));
            Assert.That(t.Game.TotalCrews, Is.EqualTo(2));
            Assert.That(t.Game.FreeCrews, Is.EqualTo(2));
        }

        [Test]
        public void InstantLevelsCompleteOnTheSpot()
        {
            var t = new TestGame();
            var placed = t.Game.PlaceBuilding("drinks_stand", FreeX, FreeY);
            Assert.That(placed.Ok, Is.True, placed.Error);
            var stand = t.Game.FindBuilding(placed.BuildingId);
            Assert.That(stand.Level, Is.EqualTo(1));
            Assert.That(stand.IsUnderConstruction, Is.False);
            Assert.That(t.Game.Balance(Currencies.Cash), Is.EqualTo(500 - 25));
            Assert.That(t.Game.StartUpgrade(stand.Id).Ok, Is.True);
            Assert.That(stand.Level, Is.EqualTo(2));
        }

        [Test]
        public void InstantLevelsNeedNoCrew()
        {
            var t = new TestGame();
            t.GiveCash(100_000);
            int stand = t.Game.PlaceBuilding("drinks_stand", FreeX, FreeY).BuildingId;
            t.ForceLevel(stand, 4);
            Assert.That(t.Game.StartUpgrade(stand).Ok, Is.True);              // level 5 takes 3 seconds: crew 1
            Assert.That(t.Game.StartUpgrade(t.Stadium.Id).Ok, Is.True);       // a minute: crew 2
            Assert.That(t.Game.FreeCrews, Is.EqualTo(0));

            var ground = t.Game.PlaceBuilding("training_ground", 20, 38);
            Assert.That(ground.Ok, Is.True, "an instant build goes ahead with every crew busy");
            Assert.That(t.Game.StartUpgrade(ground.BuildingId).Ok, Is.True);
            Assert.That(t.Game.StartUpgrade(t.Find("clubhouse").Id).Ok, Is.True);
        }

        [Test]
        public void TimedUpgradeCompletesWhenItsTimerEnds()
        {
            var t = new TestGame();
            int id = t.Game.PlaceBuilding("drinks_stand", FreeX, FreeY).BuildingId;
            t.ForceLevel(id, 4);
            Assert.That(t.Game.StartUpgrade(id).Ok, Is.True);
            var stand = t.Game.FindBuilding(id);
            Assert.That(stand.Construction.EndsAt, Is.EqualTo(t.Game.Now + 3));
            Assert.That(t.Game.FreeCrews, Is.EqualTo(1));
            t.Wait(2);
            Assert.That(stand.Level, Is.EqualTo(4));
            t.Wait(1);
            Assert.That(stand.Level, Is.EqualTo(5));
            Assert.That(t.Game.FreeCrews, Is.EqualTo(2));
        }

        [Test]
        public void UpgradeFinishesWhileTheGameIsClosed()
        {
            var t = new TestGame();
            t.GiveCash(1000);
            Assert.That(t.Game.StartUpgrade(t.Stadium.Id).Ok, Is.True);
            long endsAt = t.Stadium.Construction.EndsAt;

            t.Clock.Advance(10 * 3600);      // ten hours with the game closed
            var report = t.Game.Update();     // one Update on resume

            Assert.That(t.Game.StadiumLevel, Is.EqualTo(2));
            Assert.That(report.UpgradesCompleted, Is.EqualTo(1));
            Assert.That(report.ElapsedSeconds, Is.EqualTo(10 * 3600));
            Assert.That(t.EventsOf<UpgradeCompleted>().Single().At, Is.EqualTo(endsAt), "stamped with when it really finished");
            Assert.That(t.EventsOf<StadiumLevelReached>().Single().Level, Is.EqualTo(2));
        }

        [Test]
        public void ActionsApplyDueCompletionsFirst()
        {
            var t = new TestGame();
            t.GiveCash(100_000);
            t.Game.StartUpgrade(t.Stadium.Id);
            t.Clock.Advance(3600); // no Update: the player's tap is the first thing that happens after an hour
            var result = t.Game.StartUpgrade(t.Stadium.Id);
            Assert.That(result.Error, Is.EqualTo(Errors.RequirementNotMet), "not 'already under construction': level 2 had finished");
            Assert.That(t.Game.StadiumLevel, Is.EqualTo(2));
        }

        [Test]
        public void TimedProjectsAreLimitedByConstructionCrews()
        {
            var t = new TestGame();
            t.GiveCash(100_000);
            int stand = t.Game.PlaceBuilding("drinks_stand", FreeX, FreeY).BuildingId;
            t.ForceLevel(stand, 4);
            var clubhouse = t.Find("clubhouse");
            t.ForceLevel(clubhouse.Id, 3);
            Assert.That(t.Game.StartUpgrade(t.Stadium.Id).Ok, Is.True);
            Assert.That(t.Game.StartUpgrade(stand).Ok, Is.True);
            Assert.That(t.Game.StartUpgrade(clubhouse.Id).Error, Is.EqualTo(Errors.NoFreeCrew), "Clubhouse level 4 takes time");
        }

        [Test]
        public void StadiumLevelCapsHowFarBuildingsGo()
        {
            var t = new TestGame();
            int stand = t.Game.PlaceBuilding("drinks_stand", FreeX, FreeY).BuildingId;
            t.ForceLevel(stand, 10);
            t.GiveCash(1_000_000);
            Assert.That(t.Game.StartUpgrade(stand).Error, Is.EqualTo(Errors.StadiumTooLow));
            Assert.That(t.Game.CurrentMaxLevel("drinks_stand"), Is.EqualTo(10));

            t.ReachStadium(2);
            Assert.That(t.Game.CurrentMaxLevel("drinks_stand"), Is.EqualTo(12));
            Assert.That(t.Game.StartUpgrade(stand).Ok, Is.True);
        }

        [Test]
        public void StadiumLevelGatesNewBuildingTypes()
        {
            var t = new TestGame();
            t.GiveCash(100_000);
            Assert.That(t.Game.PlaceBuilding("food_stall", FreeX - 4, FreeY).Error, Is.EqualTo(Errors.StadiumTooLow));
            t.ReachStadium(2);
            Assert.That(t.Game.PlaceBuilding("food_stall", FreeX - 4, FreeY).Ok, Is.True);
        }

        [Test]
        public void StadiumLevelGatesHowManyOfABuilding()
        {
            var t = new TestGame();
            t.GiveCash(100_000);
            Assert.That(t.Game.PlaceBuilding("drinks_stand", FreeX, FreeY).Ok, Is.True);
            Assert.That(t.Game.PlaceBuilding("drinks_stand", FreeX, FreeY + 2).Error, Is.EqualTo(Errors.StadiumTooLow), "a second stand comes at Stadium 5");
            Assert.That(t.Game.RemainingAllowance("drinks_stand"), Is.EqualTo(0));
            Assert.That(t.Game.PlaceBuilding("clubhouse", FreeX, FreeY + 2).Error, Is.EqualTo(Errors.LimitReached), "there is only ever one Clubhouse");
        }

        [Test]
        public void StadiumNeedsTheBuildingsItRequires()
        {
            var t = new TestGame();
            t.ReachStadium(2);
            t.GiveCash(1_000_000);
            Assert.That(t.Game.StartUpgrade(t.Stadium.Id).Error, Is.EqualTo(Errors.RequirementNotMet), "Stadium 3 needs Training Ground 5");

            int ground = t.Build("training_ground");
            t.ForceLevel(ground, 5);
            Assert.That(t.Game.StartUpgrade(t.Stadium.Id).Ok, Is.True);
        }

        [Test]
        public void PlacementMustBeInsideTheBuildableAreaAndNotOverlap()
        {
            var t = new TestGame();
            Assert.That(t.Game.CheckPlacement("drinks_stand", 0, 0), Is.EqualTo(Errors.InvalidPosition));
            Assert.That(t.Game.CheckPlacement("drinks_stand", 43, 22), Is.EqualTo(Errors.InvalidPosition), "2 wide at x=43 pokes out of an area ending at 44");
            Assert.That(t.Game.CheckPlacement("drinks_stand", 42, 22), Is.Null);
            Assert.That(t.Game.CheckPlacement("drinks_stand", 20, 25), Is.EqualTo(Errors.Overlaps), "clips the Clubhouse");
            Assert.That(t.Game.CheckPlacement("drinks_stand", 20, 24), Is.Null, "directly beside it is fine");
        }

        [Test]
        public void LandOpensUpAsTheStadiumGrows()
        {
            var t = new TestGame();
            Assert.That(t.Game.CheckPlacement("drinks_stand", 18, 20), Is.EqualTo(Errors.InvalidPosition));
            t.ReachStadium(2);
            Assert.That(t.Game.CheckPlacement("drinks_stand", 18, 20), Is.Null);
        }

        [Test]
        public void CannotSpendMoneyTheClubDoesNotHave()
        {
            var t = new TestGame();
            t.State.Wallet.Balances[Currencies.Cash] = 24; // the stand costs £25
            Assert.That(t.Game.PlaceBuilding("drinks_stand", FreeX, FreeY).Error, Is.EqualTo(Errors.NotEnoughCurrency));
            Assert.That(t.State.Buildings.Count, Is.EqualTo(2));
            Assert.That(t.Game.Balance(Currencies.Cash), Is.EqualTo(24));
        }

        [Test]
        public void CancellingAnUpgradeRefundsHalfAndKeepsTheLevel()
        {
            var t = new TestGame();
            t.GiveCash(1000);
            t.Game.StartUpgrade(t.Stadium.Id);
            Assert.That(t.Game.CancelConstruction(t.Stadium.Id).Ok, Is.True);
            Assert.That(t.Game.StadiumLevel, Is.EqualTo(1));
            Assert.That(t.Stadium.IsUnderConstruction, Is.False);
            Assert.That(t.Game.Balance(Currencies.Cash), Is.EqualTo(500 + 1000 - 1000 + 500));
            Assert.That(t.Game.FreeCrews, Is.EqualTo(2));
        }

        [Test]
        public void CancellingANewBuildingRemovesIt()
        {
            var t = new TestGame();
            t.ReachStadium(3);
            t.GiveCash(1000);
            var spot = t.Game.FindPlacement("club_shop").Value;
            var placed = t.Game.PlaceBuilding("club_shop", spot.x, spot.y); // 30 seconds to build
            Assert.That(t.Game.FindBuilding(placed.BuildingId).IsUnderConstruction, Is.True);
            Assert.That(t.Game.CancelConstruction(placed.BuildingId).Ok, Is.True);
            Assert.That(t.Game.FindBuilding(placed.BuildingId), Is.Null);
            Assert.That(t.EventsOf<UpgradeCancelled>().Last().BuildingRemoved, Is.True);
            Assert.That(t.Game.CheckPlacement("club_shop", spot.x, spot.y), Is.Null, "the plot is free again");
        }

        [Test]
        public void FinishNowIsFreeInTheLastFewSeconds()
        {
            var t = new TestGame();
            int id = t.Game.PlaceBuilding("drinks_stand", FreeX, FreeY).BuildingId;
            t.ForceLevel(id, 4);
            t.Game.StartUpgrade(id); // 3 seconds
            Assert.That(t.Game.FinishNowCost(id), Is.EqualTo(0));
            Assert.That(t.Game.FinishNow(id).Ok, Is.True);
            Assert.That(t.Game.FindBuilding(id).Level, Is.EqualTo(5));
            Assert.That(t.Game.Balance(Currencies.Credits), Is.EqualTo(100));
        }

        [Test]
        public void FinishNowChargesCreditsByRemainingTime()
        {
            var t = new TestGame();
            t.GiveCash(1000);
            t.Game.StartUpgrade(t.Stadium.Id); // a minute
            Assert.That(t.Game.FinishNowCost(t.Stadium.Id), Is.EqualTo(1));
            Assert.That(t.Game.FinishNow(t.Stadium.Id).Ok, Is.True);
            Assert.That(t.Game.StadiumLevel, Is.EqualTo(2));
            Assert.That(t.Game.Balance(Currencies.Credits), Is.EqualTo(100 - 1 + 10), "one credit spent, ten earned as the Stadium 2 reward");
            Assert.That(t.EventsOf<UpgradeFinishedEarly>().Single().CreditsSpent, Is.EqualTo(1));
        }

        [TestCase(15, 0)]
        [TestCase(16, 1)]
        [TestCase(60, 1)]
        [TestCase(1800, 11)]
        [TestCase(3600, 20)]
        [TestCase(86400, 260)]
        [TestCase(604800, 1000)]
        [TestCase(1209600, 1864)]  // past the last point the final slope continues
        public void FinishNowCostCurve(long remaining, long expected)
        {
            Assert.That(Systems.Pricing.FinishNowCost(TestContent.Shipped.Economy, remaining), Is.EqualTo(expected));
        }

        [Test]
        public void ClockRollbackNeverRewindsTheGame()
        {
            var t = new TestGame();
            t.GiveCash(1000);
            t.Game.StartUpgrade(t.Stadium.Id);
            long endsAt = t.Stadium.Construction.EndsAt;

            t.Wait(20);
            t.Clock.Set(Start - 86400); // the device clock is wound back a day
            var report = t.Game.Update();
            Assert.That(report.ClockRolledBack, Is.True);
            Assert.That(t.Game.Now, Is.EqualTo(Start + 20));
            Assert.That(t.EventsOf<ClockRollbackDetected>().Count(), Is.EqualTo(1));

            // Winding it forward again only gets back to where the game was; no time is gained.
            t.Clock.Set(Start + 20);
            t.Game.Update();
            Assert.That(t.Stadium.Construction.EndsAt, Is.EqualTo(endsAt));
            Assert.That(t.Game.StadiumLevel, Is.EqualTo(1));
            t.Clock.Set(endsAt);
            t.Game.Update();
            Assert.That(t.Game.StadiumLevel, Is.EqualTo(2));
        }

        [Test]
        public void SeveralCompletionsInOneAbsenceAreAppliedInOrder()
        {
            var t = new TestGame();
            t.GiveCash(100_000);
            int stand = t.Game.PlaceBuilding("drinks_stand", FreeX, FreeY).BuildingId;
            t.ForceLevel(stand, 4);
            t.Game.StartUpgrade(t.Stadium.Id);   // 60 seconds
            t.Game.StartUpgrade(stand);          // 3 seconds
            int before = t.EventsOf<UpgradeCompleted>().Count();
            var report = t.Wait(86400);
            Assert.That(report.UpgradesCompleted, Is.EqualTo(2));
            var completed = t.EventsOf<UpgradeCompleted>().Skip(before).ToList();
            Assert.That(completed.Select(e => e.Def), Is.EqualTo(new[] { "drinks_stand", "stadium" }));
            Assert.That(completed.Select(e => e.At), Is.Ordered);
        }
    }
}
