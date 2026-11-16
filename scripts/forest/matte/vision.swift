// Apple Vision's foreground mask (the "lift subject" model, on the Neural Engine): no download, no Python.
// Usage: swift scripts/forest/matte/vision.swift <in.png> <mask.png>
// Writes an 8-bit greyscale soft mask at the input's size.

import CoreImage
import Foundation
import ImageIO
import UniformTypeIdentifiers
import Vision

let args = CommandLine.arguments
guard args.count == 3 else {
  FileHandle.standardError.write("usage: vision.swift <in.png> <mask.png>\n".data(using: .utf8)!)
  exit(2)
}
let input = URL(fileURLWithPath: args[1])
let output = URL(fileURLWithPath: args[2])

let handler = VNImageRequestHandler(url: input)
let request = VNGenerateForegroundInstanceMaskRequest()
try handler.perform([request])
guard let result = request.results?.first else {
  FileHandle.standardError.write("no foreground found\n".data(using: .utf8)!)
  exit(1)
}
let buffer = try result.generateScaledMaskForImage(forInstances: result.allInstances, from: handler)
let mask = CIImage(cvPixelBuffer: buffer)
let context = CIContext()
guard let cg = context.createCGImage(mask, from: mask.extent, format: .L8, colorSpace: CGColorSpaceCreateDeviceGray()),
  let dest = CGImageDestinationCreateWithURL(output as CFURL, UTType.png.identifier as CFString, 1, nil)
else { exit(1) }
CGImageDestinationAddImage(dest, cg, nil)
CGImageDestinationFinalize(dest)
