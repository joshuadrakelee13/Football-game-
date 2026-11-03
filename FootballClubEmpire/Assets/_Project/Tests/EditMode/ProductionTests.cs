using System.Linq;
using FCE.Core.Content;
using NUnit.Framework;

namespace FCE.Core.Tests
{
    public class ProductionTests
    {
        const int FreeX = 32, FreeY = 12;

        /// <summary>A built drinks stand: £5 every 5 seconds, holds £600.</summary>
        static (TestGame t, int id) WithDrinksStand()
        {
            var t = new TestGame();
            var placed = t.Game.PlaceBuilding("drinks_stand", FreeX, FreeY);
            Assert.That(placed.Ok, Is.True, placed.Error);
            t.Wait(10); // build time
            Assert.That(t.Game.FindBuilding(placed.BuildingId).Level, Is.EqualTo(1));
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
            Assert.That(t.Game.FindBuilding(id).Producer.Stored, Is.EqualTo(600));
            Assert.That(report.Earned[Currencies.Cash], Is.EqualTo(600), "offline earnings are bounded by what the building holds");
        }

        [Test]
        public void ABuildingLeftForYearsDoesNotOverflow()
        {
            var (t, id) = WithDrinksStand();
            t.Wait(50L * 365 * 86400);
            Assert.That(t.Game.FindBuilding(id).Producer.Stored, Is.EqualTo(600));
        }

        [Test]
        public void CollectingPaysTheClubAndRecordsTheIncome()
        {
            var (t, id) = WithDrinksStand();
            long before = t.Game.Balance(Currencies.Cash);
            t.Wait(60);
            var result = t.Game.Collect(id);
            Assert.That(result.Ok, Is.True);
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
            t.Wait(3600);              // full after 10 minutes, then idle
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
            t.Wait(20);
            Assert.That(t.Game.StartUpgrade(id).Ok, Is.True);
            var stand = t.Game.FindBuilding(id);
            long buildTime = stand.Construction.EndsAt - t.Game.Now;
            t.Wait(buildTime);
            Assert.That(stand.Level, Is.EqualTo(2));
            Assert.That(stand.Producer.Stored, Is.EqualTo(20), "takings from before the upgrade are kept, none earned during it");
            t.Wait(5);
            Assert.That(stand.Producer.Stored, Is.EqualTo(26), "level 2 earns £6 a cycle");
        }

        [Test]
        public void AnUpgradeFinishingOfflineSwitchesRateAtTheRightMoment()
        {
            var (t, id) = WithDrinksStand();
            t.Game.StartUpgrade(id);
            var stand = t.Game.FindBuilding(id);
            long buildTime = stand.Construction.EndsAt - t.Game.Now;
            // Away for the build plus exactly 50 seconds: should be ten level-2 cycles and nothing at level 1.
            var report = t.Wait(buildTime + 50);
            Assert.That(stand.Producer.Stored, Is.EqualTo(60));
            Assert.That(report.Earned[Currencies.Cash], Is.EqualTo(60));
        }

        [Test]
        public void CollectAllEmptiesEveryProducer()
        {
            var (t, standId) = WithDrinksStand();
            t.GiveCash(10_000);
            var shop = t.Game.PlaceBuilding("club_shop", FreeX - 4, FreeY);
            Assert.That(shop.Ok, Is.True, shop.Error);
            t.Wait(3600);
            long before = t.Game.Balance(Currencies.Cash);
            long waiting = t.State.Buildings.Where(b => b.Producer != null).Sum(b => b.Producer.Stored);
            Assert.That(waiting, Is.GreaterThan(0));
            Assert.That(t.Game.CollectAll().Ok, Is.True);
            Assert.That(t.Game.Balance(Currencies.Cash), Is.EqualTo(before + waiting));
            var day = t.State.Ledger.Day(t.Game.Now);
            Assert.That(day.Income.Keys, Is.EquivalentTo(new[] { "food_drink", "merchandise" }));
        }

        [Test]
        public void QuoteShowsIncomeChangeAndPayback()
        {
            var (t, id) = WithDrinksStand();
            var quote = t.Game.QuoteUpgrade(id);
            Assert.That(quote.IncomePerHourFrom, Is.EqualTo(3600));  // £5 every 5s
            Assert.That(quote.IncomePerHourTo, Is.EqualTo(4320));    // £6 every 5s
            long cost = quote.NextLevel.Cost;
            Assert.That(quote.PaybackSeconds, Is.EqualTo((long)System.Math.Ceiling(cost / (720 / 3600.0))));
        }

        [Test]
        public void BuildMenuQuoteForANewBuilding()
        {
            var t = new TestGame();
            var quote = t.Game.QuoteNew("club_shop");
            Assert.That(quote.CanStart, Is.True);
            Assert.That(quote.CurrentLevel, Is.EqualTo(0));
            Assert.That(quote.IncomePerHourTo, Is.EqualTo(1500));
            Assert.That(quote.PaybackSeconds, Is.EqualTo(3600), "£1,500 at £1,500 an hour");
            Assert.That(t.Game.QuoteNew("food_stall").BlockedBy, Is.EqualTo(Errors.LimitReached), "unlocks at Clubhouse 2");
        }
    }
}
