"""
Custom torchaudio hook that avoids importing the `torchaudio.lib` pseudo-package.

PyInstaller's contrib hook tries to treat `torchaudio.lib` as a Python package
and recurses through `collect_submodules("torchaudio.lib")`, but our vendored
setup populates that directory with only shared libraries. Overriding the hook
lets the build proceed while still bundling the required binaries.
"""

from PyInstaller.utils.hooks import collect_dynamic_libs

# Include torchaudio's native libraries; PyInstaller will place them alongside
# the frozen binary where our vendoring step can rewrite load commands.
binaries = collect_dynamic_libs("torchaudio")

# No additional hidden imports are needed (torchaudio.lib is not a Python package).
hiddenimports: list[str] = []
