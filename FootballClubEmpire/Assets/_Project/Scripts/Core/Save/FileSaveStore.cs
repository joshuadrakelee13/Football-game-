using System;
using System.Collections.Generic;
using System.IO;
using System.Text;

namespace FCE.Core.Save
{
    /// <summary>Where save text lives. Unity uses <see cref="FileSaveStore"/>; tests can use memory.</summary>
    public interface ISaveStore
    {
        void Write(string text);
        /// <summary>
        /// Candidate saves, most trustworthy first. The caller takes the first one it can read, so a damaged main
        /// file falls back to the last good one rather than losing the club.
        /// </summary>
        IEnumerable<(string source, string text)> ReadCandidates();
    }

    /// <summary>
    /// One save slot as files in a folder, written so that a crash or a killed app at any moment leaves a readable save:
    ///   1. the new save is written in full to <c>club.json.tmp</c> and flushed to disk;
    ///   2. the current <c>club.json</c> becomes <c>club.json.bak</c>;
    ///   3. the temporary file becomes <c>club.json</c>.
    /// Interrupted between 2 and 3, the temporary file holds the newest complete save and is read next.
    /// </summary>
    public sealed class FileSaveStore : ISaveStore
    {
        readonly string _main, _temp, _backup;

        public FileSaveStore(string directory, string slot = "club")
        {
            Directory.CreateDirectory(directory);
            _main = Path.Combine(directory, slot + ".json");
            _temp = _main + ".tmp";
            _backup = _main + ".bak";
        }

        public void Write(string text)
        {
            var bytes = new UTF8Encoding(false).GetBytes(text);
            using (var stream = new FileStream(_temp, FileMode.Create, FileAccess.Write, FileShare.None))
            {
                stream.Write(bytes, 0, bytes.Length);
                stream.Flush(true);
            }
            if (File.Exists(_main))
            {
                if (File.Exists(_backup)) File.Delete(_backup);
                File.Move(_main, _backup);
            }
            File.Move(_temp, _main);
        }

        public IEnumerable<(string source, string text)> ReadCandidates()
        {
            foreach (var (source, path) in new[] { ("main", _main), ("temp", _temp), ("backup", _backup) })
            {
                string text = null;
                try { if (File.Exists(path)) text = File.ReadAllText(path, Encoding.UTF8); }
                catch (IOException) { }
                catch (UnauthorizedAccessException) { }
                if (!string.IsNullOrEmpty(text)) yield return (source, text);
            }
        }
    }
}
