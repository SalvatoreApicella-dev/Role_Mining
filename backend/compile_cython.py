import os
from setuptools import setup, Extension
from Cython.Build import cythonize

ext_modules = []

for root, _, files in os.walk("app"):
    for file in files:
        if file.endswith(".py") and not file.endswith("__init__.py"):
            full_path = os.path.join(root, file)
            rel_path = os.path.relpath(full_path, ".")
            mod_name = os.path.splitext(rel_path)[0].replace(os.sep, ".")
            ext_modules.append(Extension(mod_name, [full_path]))

setup(
    name="role_mining_backend",
    ext_modules=cythonize(
        ext_modules,
        compiler_directives={"language_level": "3"},
        annotate=False,
    ),
)
