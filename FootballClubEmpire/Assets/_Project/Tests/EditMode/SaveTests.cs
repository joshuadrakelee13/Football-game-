using System;
using System.IO;
using System.Linq;
using FCE.Core.Content;
using FCE.Core.Save;
using FCE.Core.State;
using FCE.Core.Time;
using NUnit.Framework;

namespace FCE.Core.Tests
{
    public class SaveTests
    {
        /// <summary>A club with a bit of everything: several buildings, takings waiting, a project mid-build, a ledger.</summary>
        static TestGame BusyClub()
        {
            var t = new TestGame();
            t.ReachStadium(3);
            t.Build("drinks_stand");
            t.Build("club_shop");
            t.Wait(1234);
            t.Game.CollectAll();
            t.Wait(77);
            t.GiveCash(50_000);
            Assert.That(t.Game.StartUpgrade(t.Find("club_shop").Id).Ok, Is.True);
            return t;
        }

        [Test]
        public void ARoundTripIsExact()
        {
            var t = BusyClub();
            string first = SaveSerializer.Serialize(t.State, t.Game.Now);
            var loaded = SaveSerializer.Deserialize(first, t.Content);
            string second = SaveSerializer.Serialize(loaded.State, t.Game.Now);
            Assert.That(second, Is.EqualTo(first));
            Assert.That(loaded.Repairs, Is.Empty);
            Assert.That(loaded.Version, Is.EqualTo(SaveSerializer.CurrentVersion));
        }

        [Test]
        public void ALoadedClubCarriesOnExactlyAsIfItHadNeverBeenSaved()
        {
            var original = BusyClub();
            var loaded = SaveSerializer.Deserialize(SaveSerializer.Serialize(original.State, original.Game.Now), original.Content).State;
            var clock = new ManualClock(original.Clock.UtcNowSeconds);
            var resumed = new Game(original.Content, loaded, clock);

            foreach (var (game, c) in new[] { (original.Game, original.Clock), (resumed, clock) })
            {
                c.Advance(5 * 3600);
                game.CollectAll();
                game.StartUpgrade(game.Buildings.First(b => b.Def == "drinks_stand").Id);
                c.Advance(600);
                game.Update();
            }

            Assert.That(SaveSerializer.Serialize(loaded, 0), Is.EqualTo(SaveSerializer.Serialize(original.State, 0)));
        }

        [Test]
        public void ProgressContinuesFromTheSaveWhenTheGameIsReopenedLater()
        {
            var t = BusyClub();
            var shop = t.Find("club_shop");
            long endsAt = shop.Construction.EndsAt;
            string text = SaveSerializer.Serialize(t.State, t.Game.Now);

            // The app is closed, and opened again ten hours later.
            var clock = new ManualClock(t.Clock.UtcNowSeconds + 10 * 3600);
            var game = new Game(t.Content, SaveSerializer.Deserialize(text, t.Content).State, clock);
            var report = game.Update();

            Assert.That(report.UpgradesCompleted, Is.EqualTo(1));
            Assert.That(game.Buildings.First(b => b.Def == "club_shop").Level, Is.EqualTo(shop.Level + 1));
            Assert.That(game.Buildings.First(b => b.Def == "drinks_stand").Producer.Stored,
                Is.EqualTo(t.Content.GetLevel("drinks_stand", 1).Capacity), "filled up while away");
            Assert.That(endsAt, Is.LessThan(game.Now));
        }

        [Test]
        public void SavesFromANewerBuildAreRefused()
        {
            var t = new TestGame();
            string text = SaveSerializer.Serialize(t.State, t.Game.Now).Replace("\"version\":1", "\"version\":99");
            var e = Assert.Throws<SaveException>(() => SaveSerializer.Deserialize(text, t.Content));
            StringAssert.Contains("newer version", e.Message);
        }

        [Test]
        public void DamagedSavesAreRefused()
        {
            var t = new TestGame();
            string text = SaveSerializer.Serialize(t.State, t.Game.Now);
            Assert.Throws<SaveException>(() => SaveSerializer.Deserialize(text.Substring(0, text.Length / 2), t.Content));
            Assert.Throws<SaveException>(() => SaveSerializer.Deserialize("", t.Content));
        }

        [Test]
        public void ContentChangesSinceTheSaveAreRepaired()
        {
            var t = BusyClub();
            t.State.Buildings.Add(new BuildingState { Id = 999, Def = "demolished_kiosk", Level = 3, X = 0, Y = 0 });
            t.Find("drinks_stand").Level = 99;
            var loaded = SaveSerializer.Deserialize(SaveSerializer.Serialize(t.State, t.Game.Now), t.Content);

            Assert.That(loaded.State.Buildings.Any(b => b.Def == "demolished_kiosk"), Is.False);
            Assert.That(loaded.State.Buildings.First(b => b.Def == "drinks_stand").Level, Is.EqualTo(30));
            Assert.That(loaded.State.NextBuildingId, Is.GreaterThan(999));
            Assert.That(loaded.Repairs.Count, Is.EqualTo(2));
        }

        [Test]
        public void ASaveWithoutAStadiumIsRefused()
        {
            var t = new TestGame();
            t.State.Buildings.RemoveAll(b => b.Def == "stadium");
            Assert.Throws<SaveException>(() => SaveSerializer.Deserialize(SaveSerializer.Serialize(t.State, 0), t.Content));
        }

        // ---- Files on disk ------------------------------------------------------------------------------------

        string _dir;

        [SetUp]
        public void MakeFolder() => _dir = Path.Combine(Path.GetTempPath(), "fce-save-tests-" + Guid.NewGuid().ToString("N"));

        [TearDown]
        public void RemoveFolder() { if (Directory.Exists(_dir)) Directory.Delete(_dir, true); }

        [Test]
        public void FirstLaunchFindsNoSave()
        {
            var result = new SaveSystem(new FileSaveStore(_dir), TestContent.Shipped).Load();
            Assert.That(result.Found, Is.False);
            Assert.That(result.Skipped, Is.Empty);
        }

        [Test]
        public void SavingKeepsThePreviousSaveAsABackup()
        {
            var t = BusyClub();
            var saves = new SaveSystem(new FileSaveStore(_dir), t.Content);
            saves.Save(t.State, t.Game.Now);
            saves.Save(t.State, t.Game.Now + 1);
            Assert.That(File.Exists(Path.Combine(_dir, "club.json")), Is.True);
            Assert.That(File.Exists(Path.Combine(_dir, "club.json.bak")), Is.True);
            Assert.That(File.Exists(Path.Combine(_dir, "club.json.tmp")), Is.False);

            var result = saves.Load();
            Assert.That(result.Source, Is.EqualTo("main"));
            Assert.That(result.Save.SavedAt, Is.EqualTo(t.Game.Now + 1));
        }

        [Test]
        public void ADamagedSaveFallsBackToTheBackup()
        {
            var t = BusyClub();
            var saves = new SaveSystem(new FileSaveStore(_dir), t.Content);
            saves.Save(t.State, 100);
            saves.Save(t.State, 200);
            string main = Path.Combine(_dir, "club.json");
            File.WriteAllText(main, File.ReadAllText(main).Substring(0, 50)); // truncated mid-write by a crash

            var result = saves.Load();
            Assert.That(result.Source, Is.EqualTo("backup"));
            Assert.That(result.Save.SavedAt, Is.EqualTo(100));
            Assert.That(result.Skipped.Single(), Does.StartWith("main"));
        }

        [Test]
        public void AnInterruptedSaveIsRecoveredFromTheTemporaryFile()
        {
            var t = BusyClub();
            var saves = new SaveSystem(new FileSaveStore(_dir), t.Content);
            saves.Save(t.State, 100);
            // Simulate a crash between steps 2 and 3: the new save is complete in .tmp, main has become .bak.
            string main = Path.Combine(_dir, "club.json");
            File.Move(main, main + ".bak");
            File.WriteAllText(main + ".tmp", SaveSerializer.Serialize(t.State, 200));

            var result = saves.Load();
            Assert.That(result.Source, Is.EqualTo("temp"));
            Assert.That(result.Save.SavedAt, Is.EqualTo(200));
        }
    }
}
