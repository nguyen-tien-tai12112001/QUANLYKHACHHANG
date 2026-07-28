from pathlib import Path

from app.cif_importer import import_cif_file


def main() -> None:
    document_dir = Path("/documents")
    for branch_code in ("2600", "2602", "2604"):
        matches = list(document_dir.glob(f"{branch_code}CIF.[xX][lL][sS]"))
        if not matches:
            raise FileNotFoundError(f"Không tìm thấy {branch_code}CIF.XLS trong /documents")
        path = matches[0]
        batch_id = import_cif_file(path, path.name)
        print(f"{path.name}: batch #{batch_id}")


if __name__ == "__main__":
    main()
