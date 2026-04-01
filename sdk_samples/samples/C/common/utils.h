/**
 * CARMEN Video SDK
 *
 * @category    C Sample
 * @package     CARMEN Video C Sample
 *
 * @copyright   2024 Adaptive Recognition
 * @licence     https://adaptiverecognition.com/eula/
 */

#ifndef CARMEN_VIDEO_SDK_C_SAMPLE_UTILS_H
#define CARMEN_VIDEO_SDK_C_SAMPLE_UTILS_H

#include <carmen/StreamProcessorBuilder.h>

#include <stdio.h>

#define CHECK_CM_ERROR(EXPR) if(0!=(EXPR)) {        \
    int ecode=0;                                    \
    const char* pEstr = 0;                          \
    cmGetLastError(&ecode, &pEstr);                 \
    if(ecode != 0) {                                \
        printf("error [%d]: %s\n", ecode, pEstr);   \
        return ecode;                               \
    }                                               \
};

const char* streamStatusToString(enum CM_StreamProcessorStatus status){
    switch(status) {
        case CM_STREAMPROCESSOR_STATUS_IDLE:
            return "Idle";
        case CM_STREAMPROCESSOR_STATUS_RUNNING:
            return "Running";
        case CM_STREAMPROCESSOR_STATUS_STOPPING:
            return "Stopping";
        case CM_STREAMPROCESSOR_STATUS_FAILURE:
            return "Failure";
        case CM_STREAMPROCESSOR_STATUS_FINISHED:
            return "Finished";
        default:
            return "INVALID STATUS";
    }
}

const char* pixelFormatToString(enum CM_PIXEL_FORMAT format){
    switch(format) {
        case CM_PIXEL_FORMAT_YUV420P:
            return "YUV420P";
        case CM_PIXEL_FORMAT_RGB24:
            return "RGB24";
        case CM_PIXEL_FORMAT_BGR24:
            return "BGR24";
        case CM_PIXEL_FORMAT_GRAY8:
            return "GRAY8";
        case CM_PIXEL_FORMAT_NV12:
            return "NV12";
        case CM_PIXEL_FORMAT_NV21:
            return "NV21";
        default:
            return "INVALID PIXELFORMAT";
    }
}

void commonStatusCallback(CM_STREAM_PROCESSOR handle, enum CM_StreamProcessorStatus status) {
    printf("Stream \"%s\" (%s) status changed to \"%s\"\n",
           cm_streamprocessor_name(handle),
           cm_streamprocessor_sessionid(handle),
           streamStatusToString(status)
    );

    if(status == CM_STREAMPROCESSOR_STATUS_FINISHED){
        printf("STREAM PROCESSING HAS FINISHED in stream: \"%s\"! If the program is still running "
               "and you want to stop it, please press 'q' then 'Enter'\n",
               cm_streamprocessor_name(handle)
               );
    }
}

void printColorRGB(const CM_COLOR* color) {
    printf("Color [A=255, R=%d, G=%d, B=%d]",
       (int)(color->r),
       (int)(color->g),
       (int)(color->b)
   );
}

void printOptionalColorRGB(const CM_COLOR_OPTIONAL* optionalColor) {
    if(!optionalColor->has_value) {
        printf("Color: NO COLOR");
    } else {
        printColorRGB(&optionalColor->value);
    }
}

#endif //CARMEN_VIDEO_SDK_C_SAMPLE_UTILS_H
