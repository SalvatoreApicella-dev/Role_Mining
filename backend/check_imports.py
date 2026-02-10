
try:
    import sklearn
    print("sklearn is installed")
    import sklearn.feature_extraction.text
    import sklearn.naive_bayes
    import sklearn.linear_model
    import sklearn.pipeline
    import sklearn.preprocessing
    print("sklearn submodules are importable")
except ImportError as e:
    print(f"ImportError: {e}")
except Exception as e:
    print(f"Error: {e}")
