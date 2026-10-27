using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;

// The payload's installer validates its manifest and owns the installation.
internal static class GoalHintSetup {
    private static void Extract(string destination) {
        Directory.CreateDirectory(destination);
        string boundary = Path.GetFullPath(destination).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        using (Stream resource = Assembly.GetExecutingAssembly().GetManifestResourceStream("GoalHint.Payload"))
        using (ZipArchive archive = new ZipArchive(resource, ZipArchiveMode.Read)) {
            foreach (ZipArchiveEntry entry in archive.Entries) {
                string target = Path.GetFullPath(Path.Combine(destination, entry.FullName));
                if (!target.StartsWith(boundary, StringComparison.OrdinalIgnoreCase))
                    throw new InvalidDataException("Invalid embedded package path.");
                if (entry.FullName.EndsWith("/")) {
                    Directory.CreateDirectory(target);
                    continue;
                }
                Directory.CreateDirectory(Path.GetDirectoryName(target));
                using (Stream source = entry.Open())
                using (FileStream file = new FileStream(target, FileMode.CreateNew, FileAccess.Write))
                    source.CopyTo(file);
            }
        }
    }

    private static int Main(string[] args) {
        string temporary = null;
        try {
            if (args.Length == 1 && args[0].StartsWith("/extract:", StringComparison.OrdinalIgnoreCase)) {
                string destination = Path.GetFullPath(args[0].Substring(9));
                if (Directory.Exists(destination) && Directory.GetFileSystemEntries(destination).Length != 0)
                    throw new IOException("Extraction requires a new or empty directory.");
                Extract(destination);
                Console.WriteLine("Extracted setup payload without installing: " + destination);
                return 0;
            }
            if (args.Length != 0) throw new ArgumentException("Usage: setup.exe [/extract:directory]");
            Console.WriteLine("Goal Hint setup installs for the current user.");
            temporary = Path.Combine(Path.GetTempPath(), "GoalHint-setup-" + Guid.NewGuid().ToString("N"));
            Extract(temporary);
            string installer = Path.Combine(temporary, "payload", "install.ps1");
            var start = new ProcessStartInfo {
                FileName = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell", "v1.0", "powershell.exe"),
                Arguments = "-NoLogo -NoProfile -ExecutionPolicy Bypass -File \"" + installer + "\" -DesktopShortcut",
                UseShellExecute = false,
                WorkingDirectory = Path.GetDirectoryName(installer)
            };
            using (Process process = Process.Start(start)) {
                process.WaitForExit();
                if (process.ExitCode != 0) throw new InvalidOperationException("The installer reported an error. Review the message above.");
            }
            Console.WriteLine("Installed. Open Goal Hint using its Start menu shortcut.");
            return 0;
        } catch (Exception error) {
            Console.Error.WriteLine("Setup failed: " + error.Message);
            if (args.Length == 0 && !Console.IsInputRedirected) { Console.WriteLine("Press Enter to close."); Console.ReadLine(); }
            return 1;
        } finally {
            if (temporary != null && Directory.Exists(temporary)) {
                string boundary = Path.GetFullPath(Path.GetTempPath()).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
                if (Path.GetFullPath(temporary).StartsWith(boundary, StringComparison.OrdinalIgnoreCase))
                    Directory.Delete(temporary, true);
            }
        }
    }
}
