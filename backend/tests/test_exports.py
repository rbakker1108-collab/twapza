from twapza.db.models import Clip, ClipSource, Project, utcnow
from twapza.exports import ExportSettings, export_filename, export_key, video_filter
from twapza.media import ffmpeg


def clip(**kw) -> Clip:
    return Clip(id="c1", project_id="p1", source=ClipSource.SIMPLE, index=3, start=61.2, end=91.7, **kw)


def project() -> Project:
    now = utcnow()
    return Project(id="p1", filename="My Talk.mov", ext="mov", size_bytes=1, chunk_size=1,
                   total_chunks=1, rights_confirmed_at=now, expires_at=now)


def test_video_filter_selection():
    assert video_filter(ExportSettings(), 1280, 720) == ffmpeg.upscale_filter(1280, 720)
    assert video_filter(ExportSettings(), 1920, 1080) is None
    assert video_filter(ExportSettings(upscale_1080=False), 1280, 720) is None
    v = ExportSettings(aspect="9:16")
    assert video_filter(v, 1920, 1080) == ffmpeg.vertical_filter("crop")
    assert video_filter(v.model_copy(update={"vertical_fit": "blur"}), 640, 360) == ffmpeg.vertical_filter("blur")


def test_export_key_ignores_options_that_do_not_change_the_output():
    c = clip()
    # upscale doesn't matter for vertical, vertical_fit doesn't matter for original
    assert export_key(c, ExportSettings(aspect="9:16", upscale_1080=True)) == \
        export_key(c, ExportSettings(aspect="9:16", upscale_1080=False))
    assert export_key(c, ExportSettings(vertical_fit="blur")) == export_key(c, ExportSettings())
    # but these do
    keys = {export_key(c, s) for s in (
        ExportSettings(), ExportSettings(upscale_1080=False),
        ExportSettings(aspect="9:16"), ExportSettings(aspect="9:16", vertical_fit="blur"))}
    assert len(keys) == 4
    assert export_key(clip(), ExportSettings()) != export_key(
        Clip(id="c1", project_id="p1", source=ClipSource.SIMPLE, index=3, start=61.2, end=90.0),
        ExportSettings())


def test_export_filename():
    assert export_filename(project(), clip()) == "My_Talk_simple03_01m01s-01m31s.mp4"
    assert export_filename(project(), clip(), ExportSettings(aspect="9:16")) == \
        "My_Talk_simple03_01m01s-01m31s_vertical.mp4"
