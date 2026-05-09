using QRCoder;

namespace AssetHub.Api.Infrastructure;

public interface IBarcodeRenderer
{
    byte[] RenderQrPng(string payload, int pixelsPerModule = 8);
    string RenderQrSvg(string payload);
}

public class BarcodeRenderer : IBarcodeRenderer
{
    public byte[] RenderQrPng(string payload, int pixelsPerModule = 8)
    {
        using var generator = new QRCodeGenerator();
        using var data = generator.CreateQrCode(payload, QRCodeGenerator.ECCLevel.M);
        var png = new PngByteQRCode(data);
        return png.GetGraphic(pixelsPerModule);
    }

    public string RenderQrSvg(string payload)
    {
        using var generator = new QRCodeGenerator();
        using var data = generator.CreateQrCode(payload, QRCodeGenerator.ECCLevel.M);
        var svg = new SvgQRCode(data);
        return svg.GetGraphic(4);
    }
}
