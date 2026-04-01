/**
 * CARMEN Video SDK
 *
 * @category    C++ Sample
 * @package     CARMEN Video C++ Sample
 *
 * @copyright   2024 Adaptive Recognition
 * @licence     https://adaptiverecognition.com/eula/
 */

#ifndef CARMEN_VIDEO_SDK_CPP_SAMPLE_UTILS_HPP
#define CARMEN_VIDEO_SDK_CPP_SAMPLE_UTILS_HPP

#include <carmen/StreamProcessorBuilder.hpp>
#include <sstream>

inline std::string streamStatusToString(cm::video::StreamProcessorStatus status){
    switch(status) {
        case cm::video::StreamProcessorStatus::IDLE:
            return "Idle";
        case cm::video::StreamProcessorStatus::RUNNING:
            return "Running";
        case cm::video::StreamProcessorStatus::STOPPING:
            return "Stopping";
        case cm::video::StreamProcessorStatus::FAILURE:
            return "Failure";
        case cm::video::StreamProcessorStatus::FINISHED:
            return "Finished";
        default:
            return "INVALID STATUS";
    }
}

inline std::string pixelFormatToString(cm::PixelFormat format){
    switch(format) {
        case cm::PixelFormat::YUV420P:
            return "YUV420P";
        case cm::PixelFormat::RGB24:
            return "RGB24";
        case cm::PixelFormat::BGR24:
            return "BGR24";
        case cm::PixelFormat::GRAY8:
            return "GRAY8";
        case cm::PixelFormat::NV12:
            return "NV12";
        case cm::PixelFormat::NV21:
            return "NV21";
        default:
            return "INVALID PIXELFORMAT";
    }
}

inline std::string colorRGBIntToString(std::optional<cm::Color> c){
    std::stringstream ss;

    if(c.has_value()) {
        ss << "Color [A=255"
           << ", R=" << static_cast<int>(c->r)
           << ", G=" << static_cast<int>(c->g)
           << ", B=" << static_cast<int>(c->b) << "]";
    } else {
        ss << "NO COLOR";
    }

    return ss.str();
}

inline void commonStatusCallback(const cm::video::StreamProcessorRef& stream, cm::video::StreamProcessorStatus status) {
    std::cout << "Stream \"" << stream.name() << "\" ("
              << stream.sessionId() << ") status changed to \"" << streamStatusToString(status) << "\"" << std::endl;

    if(status == cm::video::StreamProcessorStatus::FINISHED){
        std::cout <<"STREAM PROCESSING HAS FINISHED in stream: \"" << stream.name()
            << "\"! If the program is still running and you want to stop it, please press 'q' then 'Enter'"
            << std::endl;
    }
}

#endif //CARMEN_VIDEO_SDK_CPP_SAMPLE_UTILS_HPP
