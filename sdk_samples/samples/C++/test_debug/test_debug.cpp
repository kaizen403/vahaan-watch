/**
 * Debug test - verbose logging to see what Carmen Video SDK is doing
 */
#include <iostream>
#include "utils.hpp"
#include <carmen/AnprBuilder.hpp>
#include <carmen/AdaptiveRecognitionCloudBuilder.hpp>
#include <carmen/StreamProcessorBuilder.hpp>
#include <carmen/Logger.hpp>
#include <carmen/License.hpp>

int frameCount = 0;

void onEventCallback(const cm::Event& e) {
    try {
        std::cout << "=== EVENT DETECTED ===" << std::endl;
        std::cout << "Plate text: " << e.vehicle().plate().text() << std::endl;
        std::cout << "Country: " << e.vehicle().plate().country() << std::endl;
        std::cout << "Timestamp: " << e.timestamp() << " ms" << std::endl;
        std::cout << "=====================" << std::endl;
    } catch(const std::exception& ex) {
        std::cout << "Exception in event callback: " << ex.what() << std::endl;
    }
}

void onFrameCallback(const cm::ImageProxy& ip) {
    frameCount++;
    if(frameCount % 30 == 0) {
        std::cout << "[Frame " << frameCount << "] index=" << ip.imageInfo().index() 
                  << " ts=" << ip.imageInfo().timestamp() << "ms"
                  << " " << ip.width() << "x" << ip.height()
                  << std::endl;
    }
}

int main(int argc, const char** argv) {
    try {
        if(argc < 4) {
            std::cout << "Usage: " << argv[0] << " <region> <video> <api_key>" << std::endl;
            return -1;
        }
        std::string region = argv[1];
        std::string streamUrl = argv[2];
        std::string apiKey = argv[3];

        // Enable ALL logging
        cm::log::GlobalLogger::setLogCallback([](std::string_view message, cm::log::LogLevel logLevel) {
            std::cout << "[LOG] " << message << std::endl;
        });
        cm::log::GlobalLogger::setMinLevel(cm::log::LogLevel::DEBUG);

        std::cout << "Setting CloudNNC licensing with API key..." << std::endl;
        cm::licensing::setCloudNNC(apiKey);
        std::cout << "Licensing type: " << static_cast<int>(cm::licensing::getCurrentLicensingType()) << std::endl;

        auto cloud = cm::cloud::AdaptiveRecognitionCloudBuilder()
                .apiKey(apiKey)
                .build();

        std::cout << "Building stream processor..." << std::endl;
        cm::video::StreamProcessor stream = cm::video::StreamProcessorBuilder()
                .source(streamUrl)
                .region(region)
                .name("Debug Stream")
                .eventCallback(onEventCallback)
                .statusChangeCallback(commonStatusCallback)
                .onFrameCallback(onFrameCallback)
                .cloud(cloud)
                .roi({{0.0, 0.0}, {1.0, 0.0}, {1.0, 1.0}, {0.0, 1.0}})
                .autoReconnect(false)
                .build();

        std::cout << "Starting stream processing..." << std::endl;
        stream.start();

        while(std::cin.get() != 'q');

        stream.stop();
        std::cout << "Total frames processed: " << frameCount << std::endl;
    } catch(const std::exception& e) {
        std::cout << "ERROR: " << e.what() << std::endl;
        return -1;
    }
    return 0;
}
