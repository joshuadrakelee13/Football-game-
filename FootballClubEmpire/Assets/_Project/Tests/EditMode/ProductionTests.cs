using System.Linq;
using FCE.Core.Content;
using NUnit.Framework;
using static FCE.Core.Tests.TestGame;

namespace FCE.Core.Tests
{
    public class ProductionTests
    {
        /// <summary>A newly built drinks stand: £5 every 5 seconds, holds £900 (15 minutes).</summary>
        static (TestGame t, int id) WithDrinksStand()
        {
            var t = new TestGame();
            var placed = t.Game.PlaceBuilding("drinks_stand", FreeX, FreeY);
            Assert.That(placed.Ok, Is.True, placed.Error);
            Assert.That(t.Game.FindBuilding(placed.BuildingId).Level, Is.EqualTo(1), "level 1 is instant");
            return (t, placed.BuildingId);
        }

        [Test]
        public void EarnsOneAmountPerCompletedCycle()
        {
            var (t, id) = WithDrinksStand();
            var stand = t.Game.FindBuilding(id);
            t.Wait(4);
            Assert.That(stand.Producer.Stored, Is.EqualTo(0));
            t.Wait(1);
            Assert.That(stand.Producer.Stored, Is.EqualTo(5));
            t.Wait(52);
            Assert.That(stand.Producer.Stored, Is.EqualTo(55), "57 seconds is 11 whole cycles");
        }

        [Test]
        public void ManySmallTicksEarnExactlyWhatOneLargeTickDoes()
        {
            var (a, ida) = WithDrinksStand();
            var (b, idb) = WithDrinksStand();
            for (int i = 0; i < 300; i++) a.Wait(1);
            b.Wait(300);
            Assert.That(a.Game.FindBuilding(ida).Producer.Stored, Is.EqualTo(300));
            Assert.That(b.Game.FindBuilding(idb).Producer.Stored, Is.EqualTo(300));

            for (int i = 0; i < 7; i++) a.Wait(3); // 21 seconds in uneven steps
            b.Wait(21);
            Assert.That(a.Game.FindBuilding(ida).Producer.Stored, Is.EqualTo(b.Game.FindBuilding(idb).Producer.Stored));
            Assert.That(a.Game.FindBuilding(ida).Producer.CycleProgress, Is.EqualTo(b.Game.FindBuilding(idb).Producer.CycleProgress));
        }

        [Test]
        public void StopsEarningWhenFull()
        {
            var (t, id) = WithDrinksStand();
            var report = t.Wait(8 * 3600); // left overnight
            Assert.That(t.Game.FindBuilding(id).Producer.Stored, Is.EqualTo(900));
            Assert.That(report.Earned[Currencies.Cash], Is.EqualTo(900), "offline earnings are bounded by what the building holds");
        }

        [Test]
        public void ABuildingLeftForYearsDoesNotOverflow()
        {
            var (t, id) = WithDrinksStand();
            t.Wait(50L * 365 * 86400);
            Assert.That(t.Game.FindBuilding(id).Producer.Stored, Is.EqualTo(900));
        }

        [Test]
        public void CollectingPaysTheClubAndRecordsTheIncome()
        {
            var (t, id) = WithDrinksStand();
            long before = t.Game.Balance(Currencies.Cash);
            t.Wait(60);
            Assert.That(t.Game.Collect(id).Ok, Is.True);
            Assert.That(t.Game.Balance(Currencies.Cash), Is.EqualTo(before + 60));
            Assert.That(t.Game.FindBuilding(id).Producer.Stored, Is.EqualTo(0));
            Assert.That(t.State.Ledger.Day(t.Game.Now).Income["food_drink"], Is.EqualTo(60));
            Assert.That(t.EventsOf<TakingsCollected>().Single().Amount, Is.EqualTo(60));
            Assert.That(t.Game.Collect(id).Error, Is.EqualTo(Errors.NothingToCollect));
        }

        [Test]
        public void AFullBuildingRestartsFromWhenItIsEmptied()
        {
            var (t, id) = WithDrinksStand();
            t.Wait(3600);              // full after 15 minutes, then idle
            t.Game.Collect(id);
            t.Wait(5);
            Assert.That(t.Game.FindBuilding(id).Producer.Stored, Is.EqualTo(5), "no backlog of idle time is paid out");
        }

        [Test]
        public void CycleProgressIsKeptAcrossACollection()
        {
            var (t, id) = WithDrinksStand();
            t.Wait(7);               // one cycle and two seconds
            t.Game.Collect(id);
            t.Wait(3);               // completes the second cycle
            Assert.That(t.Game.FindBuilding(id).Producer.Stored, Is.EqualTo(5));
        }

        [Test]
        public void ProductionPausesDuringItsOwnUpgrade()
        {
            var (t, id) = WithDrinksStand();
            t.ForceLevel(id, 4);       // instant levels: £8 a cycle
            t.Wait(20);
            var stand = t.Game.FindBuilding(id);
            Assert.That(stand.Producer.Stored, Is.EqualTo(32));
            Assert.That(t.Game.StartUpgrade(id).Ok, Is.True); // level 5 takes 3 seconds
            t.Wait(3);
            Assert.That(stand.Level, Is.EqualTo(5));
            Assert.That(stand.Producer.Stored, Is.EqualTo(32), "takings from before the upgrade are kept, none earned during it");
            t.Wait(5);
            Assert.That(stand.Producer.Stored, Is.EqualTo(41), "level 5 earns £9 a cycle");
        }

        [Test]
        public void AnUpgradeFinishingOfflineSwitchesRateAtTheRightMoment()
        {
            var (t, id) = WithDrinksStand();
            t.ForceLevel(id, 4);
            t.Game.StartUpgrade(id);
            // Away for the 3-second build plus exactly 50 seconds: ten level-5 cycles and nothing at level 4.
            var report = t.Wait(3 + 50);
            Assert.That(t.Game.FindBuilding(id).Producer.Stored, Is.EqualTo(90));
            Assert.That(report.Earned[Currencies.Cash], Is.EqualTo(90));
        }

        [Test]
        public void CollectAllEmptiesEveryProducer()
        {
            var t = new TestGame();
            t.ReachStadium(3);
            t.Build("drinks_stand");
            t.Build("club_shop");
            t.Wait(3600);
            long before = t.Game.Balance(Currencies.Cash);
            long waiting = t.State.Buildings.Where(b => b.Producer != null).Sum(b => b.Producer.Stored);
            Assert.That(waiting, Is.GreaterThan(0));
            Assert.That(t.Game.CollectAll().Ok, Is.True);
            Assert.That(t.Game.Balance(Currencies.Cash), Is.EqualTo(before + waiting));
            Assert.That(t.State.Ledger.Day(t.Game.Now).Income.Keys, Is.SupersetOf(new[] { "food_drink", "merchandise" }));
        }

        [Test]
        public void QuoteShowsIncomeChangeAndPayback()
        {
            var (t, id) = WithDrinksStand();
            var quote = t.Game.QuoteUpgrade(id);
            Assert.That(quote.IncomePerHourFrom, Is.EqualTo(3600));  // £5 every 5s
            Assert.That(quote.IncomePerHourTo, Is.EqualTo(4320));    // £6 every 5s
            Assert.That(quote.NextLevel.Cost, Is.EqualTo(12));
            Assert.That(quote.PaybackSeconds, Is.EqualTo(60), "£12 at an extra £720 an hour");
        }

        [Test]
        public void BuildMenuQuoteForANewBuilding()
        {
            var t = new TestGame();
            var quote = t.Game.QuoteNew("drinks_stand");
            Assert.That(quote.CanStart, Is.True);
            Assert.That(quote.CurrentLevel, Is.EqualTo(0));
            Assert.That(quote.IncomePerHourTo, Is.EqualTo(3600));
            Assert.That(quote.PaybackSeconds, Is.EqualTo(25), "£25 at £1 a second");
            Assert.That(t.Game.QuoteNew("food_stall").BlockedBy, Is.EqualTo(Errors.StadiumTooLow));
        }

        [Test]
        public void ASecondStandStartsItsOwnJourneyAtLevelOne()
        {
            var t = new TestGame();
            int first = t.Build("drinks_stand");
            t.ReachStadium(5);
            t.ForceLevel(first, 15);

            Assert.That(t.Game.QuoteNew("drinks_stand").NextLevel.Cost, Is.EqualTo(25), "the second costs what the first did");
            int second = t.Build("drinks_stand");
            var a = t.Game.FindBuilding(first);
            var b = t.Game.FindBuilding(second);
            Assert.That(b.Level, Is.EqualTo(1), "not level 15");
            Assert.That(t.Game.QuoteUpgrade(second).NextLevel.Cost, Is.EqualTo(t.Content.GetLevel("drinks_stand", 2).Cost));

            // Upgrading one leaves the other alone, and each earns at its own rate.
            t.Game.StartUpgrade(second);
            Assert.That((a.Level, b.Level), Is.EqualTo((15, 2)));
            t.Game.CollectAll();
            t.Wait(5);
            Assert.That(a.Producer.Stored, Is.EqualTo(19), "level 15: £19 a cycle");
            Assert.That(b.Producer.Stored, Is.EqualTo(6), "level 2: £6 a cycle");
        }
    }
}
