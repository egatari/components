# /// script
# requires-python = ">=3.10"
# dependencies = ["scikit-learn>=1.4", "numpy"]
# ///
"""The m-classify2d demo data: fictional 2-D points (sklearn make_blobs / make_moons with fixed seeds), written to CSV in a
temporary folder and passed through tools/sk2ega.py. Prints one JSON per line: logistic, svm, knn1, tree, kmeans."""
import csv
import os
import subprocess
import sys
import tempfile

import numpy as np
from sklearn.datasets import make_blobs, make_moons

here = os.path.dirname(os.path.abspath(__file__))


def write(path, X, y=None):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["x₁", "x₂"] + (["class"] if y is not None else []))
        for i, p in enumerate(X):
            w.writerow([f"{p[0]:.2f}", f"{p[1]:.2f}"] + ([["A", "B", "C"][y[i]]] if y is not None else []))


def run(*args):
    return subprocess.check_output([sys.executable, os.path.join(here, "sk2ega.py"), *args], text=True).strip()


with tempfile.TemporaryDirectory() as d:
    X, y = make_blobs(n_samples=40, centers=[[-1.5, -1], [1.5, 1]], cluster_std=1.0, random_state=3)
    write(f"{d}/blobs.csv", X, y)
    print(run("linear_model", f"{d}/blobs.csv", "--fit", "LogisticRegression()", "--grid", "48x32", "--levels", "0.25,0.5,0.75"))
    print(run("svm", f"{d}/blobs.csv", "--fit", "SVC(kernel='linear', C=1.0)", "--grid", "48x32"))
    Xs, ys = make_blobs(n_samples=12, centers=[[-1.5, -1], [1.5, 1]], cluster_std=1.1, random_state=5)
    write(f"{d}/few.csv", Xs, ys)
    print(run("neighbors", f"{d}/few.csv", "--fit", "KNeighborsClassifier(n_neighbors=1)"))
    print(run("tree", f"{d}/blobs.csv", "--fit", "DecisionTreeClassifier(max_depth=2, random_state=0)"))
    Xk, _ = make_blobs(n_samples=45, centers=[[-2, -1], [2, -1], [0, 2]], cluster_std=0.8, random_state=7)
    write(f"{d}/k.csv", Xk)
    print(run("cluster", f"{d}/k.csv", "--fit", "KMeans(n_clusters=3, random_state=1)"))
