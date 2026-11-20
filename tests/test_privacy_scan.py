"""privacy_scan blocks private terms from committable and staged files.

Each case builds a throwaway git repo with a copy of the tool and a
`.private-terms.txt` of FAKE terms, then runs the real CLI in a child process,
the way the pre-commit hook does.
"""
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
TOOL = REPO / "tools" / "privacy_scan.py"

# Fictional values only: this file is committed.
TERMS = "# comentario\nZelda Quimbaya\n\n555 0100\nnadie@example.invalid\n"


def git(root, *args):
    return subprocess.run(
        ["git", "-c", "user.name=Test", "-c", "user.email=test@example.invalid", *args],
        cwd=root, capture_output=True, text=True, encoding="utf-8",
    )


class PrivacyScanTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.root, ignore_errors=True)
        self.assertEqual(git(self.root, "init", "-q").returncode, 0)
        (self.root / "tools").mkdir()
        shutil.copy(TOOL, self.root / "tools" / "privacy_scan.py")
        (self.root / ".gitignore").write_text(".private-terms.txt\nlocal/\n", encoding="utf-8")
        (self.root / ".private-terms.txt").write_text(TERMS, encoding="utf-8")
        (self.root / "README.md").write_text("Proyecto de ejemplo\n", encoding="utf-8")

    def write(self, rel, text):
        path = self.root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        return path

    def scan(self, *args):
        env = dict(os.environ, PYTHONIOENCODING="utf-8")
        return subprocess.run(
            [sys.executable, str(self.root / "tools" / "privacy_scan.py"), *args],
            cwd=self.root, capture_output=True, text=True, encoding="utf-8", env=env,
        )

    def test_clean_repo_passes(self):
        result = self.scan()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("OK (3 terms", result.stdout)

    def test_tracked_and_untracked_hits_fail_with_path_line_and_term(self):
        self.write("src/app.ts", "const a = 1\n// autora: zelda QUIMBAYA\n")
        git(self.root, "add", "src/app.ts")
        self.write("notas.txt", "llamar al 555 0100\n")
        result = self.scan()
        self.assertEqual(result.returncode, 1)
        self.assertIn("src/app.ts:2: matches 'zelda quimbaya'", result.stdout)
        self.assertIn("notas.txt:1: matches '555 0100'", result.stdout)

    def test_matching_ignores_accents(self):
        self.write("a.md", "Zélda Quimbayá\n")
        result = self.scan()
        self.assertEqual(result.returncode, 1)
        self.assertIn("a.md:1:", result.stdout)

    def test_gitignored_and_binary_files_are_skipped(self):
        self.write("local/perfil.json", '{"nombre": "Zelda Quimbaya"}\n')
        (self.root / "foto.bin").write_bytes(b"\x00\x01Zelda Quimbaya\x00")
        result = self.scan()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_file_names_are_checked(self):
        self.write("docs/cv_Zelda_Quimbaya.md", "sin datos\n")
        self.write("docs/zelda quimbaya.md", "sin datos\n")
        result = self.scan()
        self.assertEqual(result.returncode, 1)
        self.assertIn("docs/zelda quimbaya.md:name:", result.stdout)
        self.assertIn("docs/cv_Zelda_Quimbaya.md:name:", result.stdout)

    def test_spaces_in_a_term_match_separators_or_nothing(self):
        self.write("a.md", "github.com/zelda-quimbaya\nzeldaquimbaya@\ntel 555.0100\n")
        result = self.scan()
        self.assertEqual(result.returncode, 1)
        for line in ("a.md:1:", "a.md:2:", "a.md:3:"):
            self.assertIn(line, result.stdout)

    def test_parentheses_and_slashes_count_as_separators(self):
        self.write("b.md", "tel (555) 0100\nref 555/0100\n")
        result = self.scan()
        self.assertEqual(result.returncode, 1)
        for line in ("b.md:1:", "b.md:2:"):
            self.assertIn(line, result.stdout)

    def test_staged_mode_reads_the_index_not_the_working_copy(self):
        path = self.write("perfil.md", "correo: nadie@example.invalid\n")
        git(self.root, "add", "perfil.md")
        path.write_text("correo: [TU_CORREO]\n", encoding="utf-8")
        staged = self.scan("--staged")
        self.assertEqual(staged.returncode, 1)
        self.assertIn("perfil.md:1: matches 'nadie@example.invalid'", staged.stdout)
        self.assertEqual(self.scan().returncode, 0)

        git(self.root, "add", "perfil.md")
        self.write("otro.md", "Zelda Quimbaya\n")  # untracked, not staged
        self.assertEqual(self.scan("--staged").returncode, 0)

    def test_force_added_terms_file_is_blocked(self):
        git(self.root, "add", "-f", ".private-terms.txt")
        result = self.scan("--staged")
        self.assertEqual(result.returncode, 1)
        self.assertIn(".private-terms.txt:file:", result.stdout)

    def test_missing_terms_file_warns_and_passes(self):
        (self.root / ".private-terms.txt").unlink()
        self.write("a.md", "Zelda Quimbaya\n")
        result = self.scan()
        self.assertEqual(result.returncode, 0)
        self.assertIn("WARNING", result.stderr)

    def hook_path(self):
        out = git(self.root, "rev-parse", "--git-path", "hooks").stdout.strip()
        hooks = Path(out)
        return (hooks if hooks.is_absolute() else self.root / hooks) / "pre-commit"

    def test_install_hook_writes_once_and_refuses_a_foreign_hook(self):
        result = self.scan("--install-hook")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        hook = self.hook_path()
        self.assertIn("tools/privacy_scan.py --staged", hook.read_text(encoding="utf-8"))
        again = self.scan("--install-hook")
        self.assertEqual(again.returncode, 0)
        self.assertIn("already installed", again.stdout)

        hook.write_text("#!/bin/sh\necho otro hook\n", encoding="utf-8")
        refused = self.scan("--install-hook")
        self.assertEqual(refused.returncode, 1)
        self.assertIn("refusing to overwrite", refused.stderr)
        self.assertEqual(hook.read_text(encoding="utf-8"), "#!/bin/sh\necho otro hook\n")

    def test_installed_hook_blocks_a_commit_with_a_private_term(self):
        self.assertEqual(self.scan("--install-hook").returncode, 0)
        git(self.root, "add", ".gitignore", "README.md", "tools/privacy_scan.py")
        self.assertEqual(git(self.root, "commit", "-q", "-m", "limpio").returncode, 0)

        self.write("datos.md", "Zelda Quimbaya\n")
        git(self.root, "add", "datos.md")
        blocked = git(self.root, "commit", "-q", "-m", "con datos")
        self.assertNotEqual(blocked.returncode, 0, blocked.stdout + blocked.stderr)
        self.assertIn("datos.md:1:", blocked.stdout + blocked.stderr)


if __name__ == "__main__":
    unittest.main()
