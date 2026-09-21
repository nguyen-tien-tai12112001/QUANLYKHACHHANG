import unittest
from types import SimpleNamespace

from fastapi import HTTPException
from starlette.requests import Request

from app.export_progress import begin_export, get_export_progress, update_export


def make_request(task_id):
    return Request({
        "type": "http",
        "method": "GET",
        "path": "/api/customer-processing/profiles/export",
        "headers": [(b"x-export-task", task_id.encode())],
    })


class ExportProgressTests(unittest.TestCase):
    def test_owner_can_read_progress_but_other_user_cannot(self):
        task_id = "excel-1780000000000-1-ab12cd34"
        owner = SimpleNamespace(id="owner")
        self.assertEqual(begin_export(make_request(task_id), owner), task_id)
        update_export(task_id, 57, "Đã ghi 57 dòng")
        self.assertEqual(get_export_progress(task_id, owner)["percent"], 57)
        with self.assertRaises(HTTPException) as denied:
            get_export_progress(task_id, SimpleNamespace(id="other"))
        self.assertEqual(denied.exception.status_code, 404)

    def test_progress_never_moves_backwards_or_claims_100_before_download(self):
        task_id = "excel-1780000000001-2-ef56ab78"
        owner = SimpleNamespace(id="owner")
        begin_export(make_request(task_id), owner)
        update_export(task_id, 75, "Đang ghi file")
        update_export(task_id, 30, "Đang ghi file")
        self.assertEqual(get_export_progress(task_id, owner)["percent"], 75)
        update_export(task_id, 100, "Đang gửi file")
        self.assertEqual(get_export_progress(task_id, owner)["percent"], 99)

    def test_unrecognized_task_header_does_not_create_progress(self):
        self.assertIsNone(begin_export(make_request("not-a-task"), SimpleNamespace(id="owner")))


if __name__ == "__main__":
    unittest.main()
