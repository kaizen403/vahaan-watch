/**
 * CARMEN Video SDK
 *
 * @category    C++ Sample
 * @package     CARMEN Video C++ Sample
 *
 * @copyright   2024 Adaptive Recognition
 * @licence     https://adaptiverecognition.com/eula/
 *
 * This sample shows how you can set up a process with CARMEN Video SDK that
 * recognizes license plates (ANPR) and vehicle attributes (MMR) on a video stream.
 * This example shows the usage of configuration settings and event result structures in detail.
 * These result details are printed on the standard output.
 * The example also saves the images corresponding to the recognition events.
 */

#include <iostream>
#include <iomanip>
#include <sstream>
#include <ctime>
#include <filesystem>

#include "utils.hpp"

#include <carmen/AnprBuilder.hpp>
#include <carmen/MmrBuilder.hpp>
#include <carmen/StreamProcessorBuilder.hpp>
#include <carmen/Logger.hpp>

void printEventData(const cm::Event& e, std::ostream& out = std::cout);
void saveImageOfEvent(const cm::Event& e);

void onEventCallback(const cm::Event& e) {
    try {
        printEventData(e, std::cout);
        saveImageOfEvent(e);

        std::cout << std::endl;
    } catch(const std::exception& e) {
        std::cout << "Exception in event callback " << e.what() << std::endl;
    } catch(...) {
        std::cout << "Exception in event callback" << std::endl;
    }
}

void onFrameCallback(const cm::ImageProxy& ip) {
    // THIS CALLBACK IS CALLED FOR EVERY DECODED FRAME
    try {
        // std::cout << "--- Image: " << ip.imageInfo().index() << " ---" << std::endl;
        
        // ip.image()->save("frame.jpg", cm::FileFormat::JPEG);
    } catch(...) {
        std::cout << "Exception in frame callback" << std::endl;
    }
}

int main(int argc, const char** argv) {
    try {
        if(argc < 3) {
            std::cout << "Usage: " << argv[0] << " <region code> <stream url / video file> [location]" << std::endl;

            //  Region code:
            //      See in Reference Manual: Region List
            //
            //  Stream url examples:
            //      "rtsp://username:password@192.168.1.2:8994"
            //      "http://192.168.1.2:9901/video.mjpeg"
            //  Video file example:
            //      "file:///C:\\video.mp4"

            return -1;
        }
        std::string region = argv[1];
        std::string streamUrl = argv[2];

        cm::log::GlobalLogger::setLogCallback( [](std::string_view message, cm::log::LogLevel logLevel) {
            std::cout << "MyLog: " << message << std::endl;
        });
        cm::log::GlobalLogger::setMinLevel(cm::log::LogLevel::WARNING);

        cm::anpr::Anpr anpr = cm::anpr::AnprBuilder()
                .type(cm::anpr::AnprBuilder::Type::LOCAL) // use LOCAL_GO for CARMEN_GO engines
                .localConcurrencyLimit(1)
                .build();

        cm::mmr::Mmr mmr = cm::mmr::MmrBuilder()
                .type(cm::mmr::MmrBuilder::Type::LOCAL)
                .build();

        cm::video::StreamProcessorBuilder builder;

        builder.source(streamUrl)
                .region(region)
                .name("Stream 1");

        if(argc > 3) {
            builder.location(argv[3]);
        }

        builder.eventCallback(onEventCallback)
                .statusChangeCallback(commonStatusCallback)
                .onFrameCallback(onFrameCallback)
                .anprColorRecognition(true)
                .mmrColorRecognition(true)
                .anpr(anpr)
                .mmr(mmr)
                .roi({{0.0, 0.0},
                      {1.0, 0.0},
                      {1.0, 1.0},
                      {0.0, 1.0}})
                .autoReconnect(true)
				.eventTimeout(std::chrono::milliseconds(60000));

        cm::video::StreamProcessor stream = builder.build();

        std::cout << "Please press 'q' then 'Enter' to stop stream processing." << std::endl;

        stream.start();

        while(std::cin.get() != 'q');

        stream.stop();
    } catch(const std::exception& e) {
        std::cout << e.what() << std::endl;
        return -1;
    }
    return 0;
}

void printPlateData(const cm::anpr::Plate& plate, std::ostream& out) {
    out << "Plate text: " << plate.text() << std::endl;
    out << "Country: " << plate.country() << std::endl;
    out << "Category: " << plate.category() << std::endl;
    out << "TextColor: " << colorRGBIntToString(plate.textColor()) << std::endl;
    out << "BgColor: " << colorRGBIntToString(plate.bgColor()) << std::endl;
    out << "StripColor: " << colorRGBIntToString(plate.stripColor()) << std::endl;
    out << "PlateSize: " << plate.plateSize() << std::endl;
}

void printPlateDetectionData(const cm::anpr::PlateDetection& detection, std::ostream& out) {
    printPlateData(detection.plate(), out);

    out << "Plate frame: ";
    for(const cm::Point& p : detection.polygon()) {
        out << "[" << p.x << ";" << p.y << "] ";
    }
    out << std::endl;

    out << "Plate detection confidence: " << std::fixed << std::setprecision(2)
        << detection.confidence() * 100 << "%" << std::endl;
}

void printVehicleAttributes(const cm::mmr::MmrData& vehicleAttributes, std::ostream& out) {
    out << "Make: " << vehicleAttributes.make() << std::endl;
    out << "Model: " << vehicleAttributes.model() << std::endl;
    out << "Color: " << colorRGBIntToString(vehicleAttributes.color()) << std::endl;
    out << "Color Name: " << vehicleAttributes.colorName() << std::endl;
    out << "Category: " << vehicleAttributes.category() << std::endl;
    out << "Viewpoint: " << vehicleAttributes.viewpoint() << std::endl;
    out << "Body Type: " << vehicleAttributes.bodyType() << std::endl;
    out << "Generation: " << vehicleAttributes.generation() << std::endl;
    out << "Variation: " << vehicleAttributes.variation() << std::endl;
}

void printMmrDetection(const cm::mmr::MmrDetection& mmrDetection, std::ostream& out) {
    printVehicleAttributes(mmrDetection.mmrData(), out);

    out << "Make confidence: " << std::fixed << std::setprecision(2)
        << mmrDetection.makeConfidence() * 100 << "%" << std::endl;
    out << "Model confidence: " << std::fixed << std::setprecision(2)
        << mmrDetection.modelConfidence() * 100 << "%" << std::endl;
    out << "Color confidence: " << std::fixed << std::setprecision(2)
        << mmrDetection.colorConfidence() * 100 << "%" << std::endl;
    out << "Category confidence: " << std::fixed << std::setprecision(2)
        << mmrDetection.categoryConfidence() * 100 << "%" << std::endl;
    out << "Viewpoint confidence: " << std::fixed << std::setprecision(2)
        << mmrDetection.viewpointConfidence() * 100 << "%" << std::endl;
    out << "Body Type confidence: " << std::fixed << std::setprecision(2)
        << mmrDetection.bodyTypeConfidence() * 100 << "%" << std::endl;
    out << "Generation confidence: " << std::fixed << std::setprecision(2)
        << mmrDetection.generationConfidence() * 100 << "%" << std::endl;
    out << "Variation confidence: " << std::fixed << std::setprecision(2)
        << mmrDetection.variationConfidence() * 100 << "%" << std::endl;
}

void printImageAttributes(const cm::ImageProxy& imageProxy, std::ostream& out) {
    out << "Image unix timestamp: " << imageProxy.imageInfo().timestamp() << " ms" << std::endl;
    out << "Image index: " << imageProxy.imageInfo().index() << std::endl;
    out << "Image width: " << imageProxy.width() << std::endl;
    out << "Image height: " << imageProxy.height() << std::endl;
    out << "Image format: " << pixelFormatToString(imageProxy.format()) << std::endl;

    std::shared_ptr<cm::Image> image = imageProxy.image();
    out << "Image width: " << image->width() << std::endl;
    out << "Image height: " << image->height() << std::endl;
    out << "Image format: " << pixelFormatToString(image->format()) << std::endl;

//    const std::vector<cm::PlaneView>& planes = image->planes();
//    out << "Planes number: " << planes.size() << std::endl;
//
//    for(const cm::PlaneView& p : planes) {
//        out << "Plane:" << std::endl;
//        out << "Plane size: " << p.size << std::endl;
//        out << "Plane linestep: " << p.linestep << std::endl;
//    }
}

void printEventData(const cm::Event& e, std::ostream& out) {
    out << "------------------------------------------------------" << std::endl;
    out << "Event arrived" << std::endl;
    out << "UUID: " << e.uuid() << std::endl;
    out << "Channel: " << e.channelName() << std::endl;
    out << "Channel sessionId: " << e.channelSessionId() << std::endl;
    out << "Unix timestamp: " << e.timestamp() << " ms" << std::endl;

    printPlateData(e.vehicle().plate(), out);
    printVehicleAttributes(e.vehicle().attributes(), out);

    out << "Event confidence: " << std::fixed << std::setprecision(2) << e.confidence() * 100 << "%" << std::endl;

    out << "Plate detections count: " << e.plateDetections().size() << std::endl;

    for(const cm::Event::PlateOnImage& detection : e.plateDetections()) {
        printPlateDetectionData(detection.detection(), out);
    }

    for(const cm::Event::MmrOnImage& detection : e.mmrDetections()) {
        printMmrDetection(detection.detection(), out);
    }

    if(!e.images().empty()) {
        out << "Frame 0 data:" << std::endl;
        printImageAttributes(*e.images()[0], out);
    }
}

void saveImageOfEvent(const cm::Event& e) {
    if(e.images().empty()) {
        return;
    }
    cm::ImageProxy& imageProxy = *e.images()[0];
    std::shared_ptr<cm::Image> image = imageProxy.image();

    std::string path = "./imagedir_cpp";
    if(!std::filesystem::exists(path)) {
        std::filesystem::create_directory(path);
    }

    std::tm start{};
    std::time_t temp = (e.timestamp() / 1000);

#ifdef WIN32
    gmtime_s(&start, &temp);
#else
    start = *gmtime(&temp);
#endif

    std::stringstream name;
    name << path << "/";
    name << std::put_time(&start, "%Y-%m-%d_%H-%M-%S");
    name << "-" << e.timestamp() % 1000 << "_" << e.uuid() << "_"
       << e.vehicle().plate().text() << "_" << e.vehicle().plate().country();

    std::string imageNameWithoutFormat = name.str();

    image->save(imageNameWithoutFormat + ".jpg", cm::FileFormat::JPEG);
    image->save(imageNameWithoutFormat + ".bmp", cm::FileFormat::BMP);
}
