#ifndef CARMEN_VIDEO_SDK_CUSTOM_STREAM_H
#define CARMEN_VIDEO_SDK_CUSTOM_STREAM_H

// This file contains classes for a custom stream implementation that loads jpeg images from a directory

#include <filesystem>
#include <vector>
#include <thread>

#include <carmen/Image.hpp>

using MyFileList = std::vector<std::filesystem::path>;

// MyFrameAdapter: Adapter to use cm::Image with custom stream.
//   This class shows how you can implement the ICustomImageStreamFrame interface.
//   You can replace the private cm::Image members with your own image class and
//   modify the interface implementation accordingly.

class MyFrameAdapter : public cm::video::ICustomImageStreamFrame {
public:
    MyFrameAdapter(cm::Image image, cm::ImageInfo info) :
            _image(std::move(image)),
            _info(info) {}

    int width() const override { return _image.width(); }
    int height() const override { return _image.height(); }
    cm::PixelFormat pixelFormat() const override { return cm::PixelFormat::YUV420P; }
    const uint8_t* planeData(int ix) const override {if(ix>=_image.planes().size()) return nullptr; return _image.planes().at(ix).data;}
    int planeLineStep(int ix) const override {if(ix>=_image.planes().size()) return 0; return _image.planes().at(ix).linestep;}

    uint64_t captureTimestamp() const override { return _info.timestamp(); }
    int64_t frameIndex() const override { return _info.index(); }

private:
    cm::Image _image;
    cm::ImageInfo _info;
};

// MyCustomImageStream: Custom stream class that loads images from a directory

class MyCustomImageStream : public cm::video::ICustomImageStream {
public:
    explicit MyCustomImageStream(MyFileList fileList) : _fileList(std::move(fileList)) {
        if(_fileList.empty()) {
            std::cout << "No files in file list." << std::endl;
            _endReached = true;
        }
    }

    std::unique_ptr<cm::video::ICustomImageStreamFrame> getFrame() override;
    int width() const override { return _width.value_or(0); }
    int height() const override { return _height.value_or(0); }
    bool eof() const override { return _endReached; }
    bool good() const override { return !eof() && !_fileList.empty(); }

    cm::PixelFormat pixelFormat() const override { return cm::PixelFormat::YUV420P; }

private:
    MyFileList _fileList;
    std::size_t _currentIx{0};
    bool _endReached{false};
    std::optional<int> _width;
    std::optional<int> _height;
};

inline std::unique_ptr<cm::video::ICustomImageStreamFrame> MyCustomImageStream::getFrame() {
    std::this_thread::sleep_for(std::chrono::milliseconds(20));

    while(!_endReached) { // loop to ignore failed image loads, returns at first load success
        auto fileIndex = _currentIx++;
        _currentIx = _currentIx % _fileList.size();
        if (_currentIx == 0) {
            _endReached = true;
        }
        const auto& curFileName = _fileList.at((fileIndex) % _fileList.size());
        auto info = cm::ImageInfo(fileIndex, fileIndex * 40);

        if(0 == (fileIndex % 100)) {
            std::cout << "Progress index/all/percentage: " << (fileIndex + 1) << "/" << _fileList.size() << "/" << 100.0*((fileIndex+1)/(double)_fileList.size()) << std::endl;
        }

        try {
            auto image = cm::Image::load(curFileName.u8string(), cm::FileFormat::JPEG);

            if (image.format() != cm::PixelFormat::YUV420P) {
                throw std::runtime_error("This sample only supports YUV420P images.");
            }

            // ICustomImageStream requires width() and height() getters but we don't know
            // the stream resolution until we read the first image file, and we can't trust that all
            // images will be the same size, so we update width/height for every loaded image
            _width = image.width();
            _height = image.height();

            return std::make_unique<MyFrameAdapter>(std::move(image), info);
        } catch (const std::exception& e) {
            std::cout << "Loading file [" << (fileIndex + 1) << "/" << _fileList.size() << "] " << curFileName.filename() << " FAILED - " << e.what() << std::endl;
//            throw;
        }
    }
    throw std::runtime_error("getFrame failed");
}


class MyStreamFactory : public cm::video::ICustomImageStreamFactory {
public:
    explicit MyStreamFactory(const std::filesystem::path& imageDir) {
        for (auto const& dir_entry : std::filesystem::directory_iterator{imageDir}) {
            if(!dir_entry.is_regular_file()) {
                continue;
            }
            _fileList.push_back(dir_entry.path());
        }

        std::cout << "Number of files found in " << imageDir << ": " << _fileList.size() << std::endl;

        std::sort(_fileList.begin(), _fileList.end(), [](const auto& file1, const auto& file2){
            return file1.filename() < file2.filename();
        });
    }

    std::unique_ptr<cm::video::ICustomImageStream> create() override {
        return std::make_unique<MyCustomImageStream>(_fileList);
    }

private:
    MyFileList _fileList;
};

#endif //CARMEN_VIDEO_SDK_CUSTOM_STREAM_H
