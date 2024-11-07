"""This bridges between the ORM and the serializable tyne and lives outside of the kernel for scope reasons."""

from neptyne_kernel.tyne_model.cell import NotebookCell
from server.models import Tyne as TyneModel


def notebook_cells_from_orm_model(model: TyneModel) -> list[NotebookCell]:
    if model.notebooks:
        notebook = model.notebooks[0]
        notebook_cells = [
            NotebookCell.from_dict(cell) for cell in notebook.contents.values()
        ]
    else:
        notebook_cells = []

    for i, cell in enumerate(notebook_cells):
        cell.cell_id = f"0{i}"

    return notebook_cells
