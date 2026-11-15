# /// script
# requires-python = ">=3.10"
# dependencies = ["scikit-learn>=1.4", "numpy"]
# ///
"""m-folds 2.1.0 demo splits: 20 fictional samples (class A or B, 5 sites P–T, months 1–20) written to a temporary CSV and
passed through tools/sk2ega.py model_selection. Prints one JSON per line: StratifiedKFold, GroupKFold, TimeSeriesSplit."""
import os
import subprocess
import sys
import tempfile

here = os.path.dirname(os.path.abspath(__file__))
with tempfile.TemporaryDirectory() as d:
    path = os.path.join(d, "samples.csv")
    with open(path, "w", encoding="utf-8") as f:
        f.write("class,site,month\n")
        for i in range(20):
            f.write(f"{'B' if i % 4 == 3 else 'A'},{'PQRST'[i // 4]},{i + 1}\n")
    for spec, extra in (("StratifiedKFold(n_splits=4, shuffle=True, random_state=0)", ["--label", "class"]),
                        ("GroupKFold(n_splits=5)", ["--group", "site"]),
                        ("TimeSeriesSplit(n_splits=4)", ["--t", "month"])):
        print(subprocess.check_output([sys.executable, os.path.join(here, "sk2ega.py"), "model_selection", path, "--fit", spec, *extra], text=True).strip())
