xs = [4, 2, 3, 1]
n = len(xs)
for i in range(n - 1):
    for j in range(n - 1 - i):
        if xs[j] > xs[j + 1]:
            xs[j], xs[j + 1] = xs[j + 1], xs[j]
print(xs)
