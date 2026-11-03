using System.Linq;
using FCE.Core.Content;
using NUnit.Framework;

namespace FCE.Core.Tests
{
    public class ConstructionTests
    {
        // Free tiles inside the buildable area on the shipped site layout.
        const int FreeX = 32, FreeY = 12;

        [Test]
        public void NewClubMatchesEconomyFile()
        {
            var t = new TestGame();
            Assert.That(t.Game.ClubhouseLevel, Is.EqualTo(1));
            Assert.That(t.Game.Balance(Currencies.Cash), Is.EqualTo(2500));
            Assert.That(t.Game.Balance(Currencies.Credits), Is.EqualTo(100));
            Assert.That(t.State.Buildings.Select(b => b.Def), Is.EquivalentTo(new[] { "clubhouse", "pitch", "main_stand" }));
            Assert.That(t.Game.TotalCrews, Is.EqualTo(2));
            Assert.That(t.Game.FreeCrews, Is.EqualTo(2));
        }

        [Test]
        public void PlacedBuildingCompletesWhenItsTimerEnds()
        {
            var t = new TestGame();
            var result = t.Game.PlaceBuilding("drinks_stand", FreeX, FreeY);
            Assert.That(result.Ok, Is.True, result.Error);

            var hut = t.Game.FindBuilding(result.BuildingId);
            Assert.That(hut.Level, Is.EqualTo(0));
            Assert.That(hut.Construction.EndsAt, Is.EqualTo(TestGame.Start + 10));
            Assert.That(t.Game.Balance(Currencies.Cash), Is.EqualTo(2500 - 100));
            Assert.That(t.Game.FreeCrews, Is.EqualTo(1));

            t.Wait(9);
            Assert.That(hut.Level, Is.EqualTo(0));
            t.Wait(1);
            Assert.That(hut.Level, Is.EqualTo(1));
            Assert.That(hut.IsUnderConstruction, Is.False);
            Assert.That(t.Game.FreeCrews, Is.EqualTo(2));
        }

        [Test]
        public void UpgradeFinishesWhileTheGameIsClosed()
        {
            var t = new TestGame();
            var stand = t.Find("main_stand");
            Assert.That(t.Game.StartUpgrade(stand.Id).Ok, Is.True);
            long endsAt = stand.Construction.EndsAt;

            // Ten hours pass with the game closed; then one Update on resume.
            t.Clock.Advance(10 * 3600);
            var report = t.Game.Update();

            Assert.That(stand.Level, Is.EqualTo(2));
            Assert.That(report.UpgradesCompleted, Is.EqualTo(1));
            Assert.That(report.ElapsedSeconds, Is.EqualTo(10 * 3600));
            var completed = t.EventsOf<UpgradeCompleted>().Single();
            Assert.That(completed.At, Is.EqualTo(endsAt), "completion is stamped with when it really finished, not when the player came back");
        }

        [Test]
        public void ActionsApplyDueCompletionsFirst()
        {
            var t = new TestGame();
            var pitch = t.Find("pitch");
            t.Game.StartUpgrade(pitch.Id);
            t.Clock.Advance(3600); // no Update: the player's tap is the first thing that happens after an hour
            var result = t.Game.StartUpgrade(pitch.Id);
            // Level 3 needs Clubhouse 2, but the point is that level 2 had already completed rather than "already under construction".
            Assert.That(result.Error, Is.EqualTo(Errors.ClubhouseTooLow));
            Assert.That(pitch.Level, Is.EqualTo(2));
        }

        [Test]
        public void ProjectsAreLimitedByConstructionCrews()
        {
            var t = new TestGame();
            Assert.That(t.Game.StartUpgrade(t.Find("pitch").Id).Ok, Is.True);
            Assert.That(t.Game.StartUpgrade(t.Find("main_stand").Id).Ok, Is.True);
            Assert.That(t.Game.PlaceBuilding("drinks_stand", FreeX, FreeY).Error, Is.EqualTo(Errors.NoFreeCrew));
        }

        [Test]
        public void ClubhouseLevelGatesOtherBuildings()
        {
            var t = new TestGame();
            var pitch = t.Find("pitch");
            t.ForceLevel(pitch.Id, 2);
            t.GiveCash(1_000_000);
            Assert.That(t.Game.StartUpgrade(pitch.Id).Error, Is.EqualTo(Errors.ClubhouseTooLow));

            t.ForceLevel(t.Find("clubhouse").Id, 2);
            Assert.That(t.Game.StartUpgrade(pitch.Id).Ok, Is.True);
        }

        [Test]
        public void ClubhouseNeedsTheBuildingsItRequires()
        {
            var t = new TestGame();
            var hq = t.Find("clubhouse");
            t.ForceLevel(hq.Id, 2);
            t.GiveCash(1_000_000);
            Assert.That(t.Game.StartUpgrade(hq.Id).Error, Is.EqualTo(Errors.RequirementNotMet), "Clubhouse 3 needs Training Ground 2");

            var ground = t.Game.PlaceBuilding("training_ground", FreeX - 6, FreeY);
            Assert.That(ground.Ok, Is.True, ground.Error);
            t.Wait(t.Game.FindBuilding(ground.BuildingId).Construction.EndsAt - t.Clock.UtcNowSeconds);
            t.ForceLevel(ground.BuildingId, 2);
            Assert.That(t.Game.StartUpgrade(hq.Id).Ok, Is.True);
        }

        [Test]
        public void BuildingCountsAreLimitedByClubhouseLevel()
        {
            var t = new TestGame();
            Assert.That(t.Game.PlaceBuilding("drinks_stand", FreeX, FreeY).Ok, Is.True);
            Assert.That(t.Game.PlaceBuilding("drinks_stand", FreeX, FreeY + 3).Error, Is.EqualTo(Errors.LimitReached));
            Assert.That(t.Game.PlaceBuilding("gym", FreeX, FreeY + 3).Error, Is.EqualTo(Errors.LimitReached), "the gym unlocks at Clubhouse 2");
            Assert.That(t.Game.RemainingAllowance("drinks_stand"), Is.EqualTo(0));
            Assert.That(t.Game.RemainingAllowance("club_shop"), Is.EqualTo(1));
        }

        [Test]
        public void PlacementMustBeInsideTheBuildableAreaAndNotOverlap()
        {
            var t = new TestGame();
            Assert.That(t.Game.CheckPlacement("drinks_stand", 0, 0), Is.EqualTo(Errors.InvalidPosition));
            Assert.That(t.Game.CheckPlacement("drinks_stand", 37, 20), Is.EqualTo(Errors.InvalidPosition), "2 wide at x=37 pokes out of an area ending at 38");
            Assert.That(t.Game.CheckPlacement("drinks_stand", 36, 20), Is.Null);
            Assert.That(t.Game.CheckPlacement("drinks_stand", 14, 22), Is.EqualTo(Errors.Overlaps), "on top of the Clubhouse");
            Assert.That(t.Game.CheckPlacement("drinks_stand", 16, 22), Is.Null, "directly beside it is fine");
        }

        [Test]
        public void CannotSpendMoneyTheClubDoesNotHave()
        {
            var t = new TestGame();
            t.State.Wallet.Balances[Currencies.Cash] = 99; // the stand costs £100
            Assert.That(t.Game.PlaceBuilding("drinks_stand", FreeX, FreeY).Error, Is.EqualTo(Errors.NotEnoughCurrency));
            Assert.That(t.State.Buildings.Count, Is.EqualTo(3));
            Assert.That(t.Game.Balance(Currencies.Cash), Is.EqualTo(99));
        }

        [Test]
        public void CancellingAnUpgradeRefundsHalfAndKeepsTheLevel()
        {
            var t = new TestGame();
            var stand = t.Find("main_stand");
            long cost = t.Content.GetLevel("main_stand", 2).Cost;
            t.Game.StartUpgrade(stand.Id);
            Assert.That(t.Game.CancelConstruction(stand.Id).Ok, Is.True);
            Assert.That(stand.Level, Is.EqualTo(1));
            Assert.That(stand.IsUnderConstruction, Is.False);
            Assert.That(t.Game.Balance(Currencies.Cash), Is.EqualTo(2500 - cost + cost / 2));
            Assert.That(t.Game.FreeCrews, Is.EqualTo(2));
        }

        [Test]
        public void CancellingANewBuildingRemovesIt()
        {
            var t = new TestGame();
            var placed = t.Game.PlaceBuilding("club_shop", FreeX, FreeY);
            Assert.That(t.Game.CancelConstruction(placed.BuildingId).Ok, Is.True);
            Assert.That(t.Game.FindBuilding(placed.BuildingId), Is.Null);
            Assert.That(t.EventsOf<UpgradeCancelled>().Single().BuildingRemoved, Is.True);
            Assert.That(t.Game.CheckPlacement("club_shop", FreeX, FreeY), Is.Null, "the plot is free again");
        }

        [Test]
        public void FinishNowIsFreeInTheLastThirtySeconds()
        {
            var t = new TestGame();
            var placed = t.Game.PlaceBuilding("drinks_stand", FreeX, FreeY); // 10 seconds
            Assert.That(t.Game.FinishNowCost(placed.BuildingId), Is.EqualTo(0));
            Assert.That(t.Game.FinishNow(placed.BuildingId).Ok, Is.True);
            Assert.That(t.Game.FindBuilding(placed.BuildingId).Level, Is.EqualTo(1));
            Assert.That(t.Game.Balance(Currencies.Credits), Is.EqualTo(100));
        }

        [Test]
        public void FinishNowChargesCreditsByRemainingTime()
        {
            var t = new TestGame();
            var hq = t.Find("clubhouse");
            t.Game.StartUpgrade(hq.Id); // 120 seconds
            long cost = t.Game.FinishNowCost(hq.Id);
            Assert.That(cost, Is.EqualTo(2));
            Assert.That(t.Game.FinishNow(hq.Id).Ok, Is.True);
            Assert.That(hq.Level, Is.EqualTo(2));
            Assert.That(t.Game.Balance(Currencies.Credits), Is.EqualTo(98));
            Assert.That(t.EventsOf<UpgradeFinishedEarly>().Single().CreditsSpent, Is.EqualTo(2));
        }

        [TestCase(30, 0)]
        [TestCase(31, 1)]
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
            var stand = t.Find("main_stand");
            t.Game.StartUpgrade(stand.Id);
            long endsAt = stand.Construction.EndsAt;

            t.Wait(20);
            t.Clock.Set(TestGame.Start - 86400); // the device clock is wound back a day
            var report = t.Game.Update();
            Assert.That(report.ClockRolledBack, Is.True);
            Assert.That(t.Game.Now, Is.EqualTo(TestGame.Start + 20));
            Assert.That(t.EventsOf<ClockRollbackDetected>().Count(), Is.EqualTo(1));

            // Winding it forward again only gets back to where the game was; no time is gained.
            t.Clock.Set(TestGame.Start + 20);
            t.Game.Update();
            Assert.That(stand.Construction.EndsAt, Is.EqualTo(endsAt));
            Assert.That(stand.Level, Is.EqualTo(1));
            t.Clock.Set(endsAt);
            t.Game.Update();
            Assert.That(stand.Level, Is.EqualTo(2));
        }

        [Test]
        public void SimultaneousCompletionsAreAllApplied()
        {
            var t = new TestGame();
            t.Game.StartUpgrade(t.Find("pitch").Id);
            t.Game.StartUpgrade(t.Find("main_stand").Id);
            var report = t.Wait(86400);
            Assert.That(report.UpgradesCompleted, Is.EqualTo(2));
            Assert.That(t.EventsOf<UpgradeCompleted>().Select(e => e.At), Is.Ordered, "completions are applied in the order they happened");
        }
    }
}
