words = ["りんご", "みかん", "りんご"]
counts = {}
for w in words:
    counts[w] = counts.get(w, 0) + 1
print(counts)
