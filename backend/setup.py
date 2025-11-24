from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

with open("requirements.txt", "r", encoding="utf-8") as fh:
    requirements = [line.strip() for line in fh if line.strip() and not line.startswith("#")]

setup(
    name="dw-migration-assistant",
    version="1.0.0",
    author="Suryasai Turaga",
    author_email="suryasai.turaga@databricks.com",
    description="Data Warehouse Migration Assistant for Databricks SQL",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/suryasai87/dw_migration_app",
    packages=find_packages(),
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "Topic :: Database",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
    ],
    python_requires=">=3.8",
    install_requires=requirements,
    entry_points={
        "console_scripts": [
            "dw-migrate=app.cli:app",
        ],
    },
)
