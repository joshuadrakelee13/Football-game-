using System;
using System.IO;
using FCE.Core.Content;

namespace FCE.Core.Tests
{
    /// <summary>Shared access to the shipped content, loaded once per test run.</summary>
    static class TestContent
    {
        static ContentDb _shipped;

        public static string Directory
        {
            get
            {
                try { return ContentDirectory.Locate(Environment.CurrentDirectory); }
                catch (DirectoryNotFoundException) { return ContentDirectory.Locate(AppContext.BaseDirectory); }
            }
        }

        public static ContentDb Shipped => _shipped ?? (_shipped = ContentDirectory.Load(Directory));

        public static ContentLoader.Sources ShippedSources() => ContentDirectory.Read(Directory);
    }
}
